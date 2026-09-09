// CRABDEN - layered pixel renderer.
//
//   scene   full-colour world, drawn at low res
//   light   ambient tint + additive lights, multiplied onto the scene
//   ui      HUD/dialogue, blitted last so the heat haze never wobbles text
//
// The scene is blitted to the display in horizontal bands with a per-band
// x-offset; that is the heat shimmer, and it costs almost nothing.

import { clamp01, lerp, mixHex, rgba } from '../lib/math.js';
const BASE_W = 400;
const BASE_H = 225;

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
    this.scale = 3;
    this.time = 0;
    this.hazeAmount = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.fade = 0;
    this.fadeColor = '#000000';
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
    for (const c of [this.scene, this.light, this.ui, this.dctx]) c.imageSmoothingEnabled = false;
  }

  resize() {
    const dpr = 1; // we upscale by integer factor ourselves; device pixels stay crisp
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(200, window.innerHeight);
    let scale = Math.max(2, Math.floor(Math.min(w / BASE_W, h / BASE_H)));
    if (scale > 6) scale = 6;
    const vw = Math.ceil(w / scale);
    const vh = Math.ceil(h / scale);
    this.scale = scale;
    if (vw !== this.vw || vh !== this.vh) {
      this.vw = vw; this.vh = vh;
      this._makeLayers();
      this._vignette = null;
    }
    this.display.width = vw * scale * dpr;
    this.display.height = vh * scale * dpr;
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

  /** Fill the light layer with the ambient multiply colour for this moment. */
  beginLights(weather) {
    const l = this.light;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.vw, this.vh);
    // never go fully black; the desert at night should still be readable
    const base = mixHex(weather.ambientColor, '#ffffff', 0.16 + weather.ambientDay * 0.06);
    l.fillStyle = base;
    l.fillRect(0, 0, this.vw, this.vh);
    l.globalCompositeOperation = 'lighter';
  }

  endLights() {
    this.light.globalCompositeOperation = 'source-over';
  }

  addLight(x, y, r, color, alpha = 1) {
    if (r <= 0 || alpha <= 0.005) return;
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
      this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.32,
      this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.72
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(18,10,4,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);
    this._vignette = c;
  }

  /** Post-process the scene, then blit to the display through the heat haze. */
  composite(weather, game) {
    const s = this.scene;

    // multiply the light layer over the world
    s.globalCompositeOperation = 'multiply';
    s.drawImage(this.lightC, 0, 0);
    s.globalCompositeOperation = 'source-over';

    // atmospheric fog / dust haze in the region's colour
    const region = game?.currentRegion;
    if (weather.fog > 0.01) {
      s.globalAlpha = clamp01(weather.fog * 0.62);
      s.fillStyle = region ? region.fog : '#d8b479';
      s.fillRect(0, 0, this.vw, this.vh);
      s.globalAlpha = 1;
    }

    // blowing sand streaks
    if (weather.sand > 0.02) {
      const n = Math.round(weather.sand * 46);
      const w = weather.windVec();
      s.globalAlpha = clamp01(weather.sand * 0.5);
      s.fillStyle = region ? region.pal.crest : '#f0dcae';
      for (let i = 0; i < n; i++) {
        const seed = i * 37.7;
        const sp = 120 + (i % 7) * 60;
        const x = ((seed * 91 + this.time * sp * (1 + w.x)) % (this.vw + 80)) - 40;
        const y = (seed * 53) % this.vh;
        const len = 6 + (i % 5) * 5;
        s.fillRect(Math.round(x), Math.round(y), len, 1);
      }
      s.globalAlpha = 1;
    }

    // low sun bloom near the horizon line
    if (weather.sunElev > 0 && weather.sunElev < 0.42) {
      const warm = weather.hour < 12 ? '#ffbe74' : '#ff9c58';
      s.globalCompositeOperation = 'lighter';
      s.globalAlpha = (0.42 - weather.sunElev) * 0.55;
      s.fillStyle = warm;
      s.fillRect(0, 0, this.vw, this.vh);
      s.globalAlpha = 1;
      s.globalCompositeOperation = 'source-over';
    }

    // lightning
    if (weather.lightningFlash > 0.01) {
      s.globalCompositeOperation = 'lighter';
      s.globalAlpha = weather.lightningFlash * 0.8;
      s.fillStyle = '#dfe8ff';
      s.fillRect(0, 0, this.vw, this.vh);
      s.globalAlpha = 1;
      s.globalCompositeOperation = 'source-over';
    }

    if (!this._vignette) this._buildVignette();
    s.drawImage(this._vignette, 0, 0);

    if (this.flash > 0.005) {
      s.globalAlpha = clamp01(this.flash);
      s.fillStyle = this.flashColor;
      s.fillRect(0, 0, this.vw, this.vh);
      s.globalAlpha = 1;
    }

    // --- blit through the shimmer -----------------------------------------
    const d = this.dctx;
    const sc = this.scale;
    d.fillStyle = '#000000';
    d.fillRect(0, 0, this.display.width, this.display.height);

    const haze = this.hazeAmount;
    if (haze < 0.02) {
      d.drawImage(this.sceneC, 0, 0, this.vw, this.vh, 0, 0, this.vw * sc, this.vh * sc);
    } else {
      // base pass first, so shifted bands never expose the background
      d.drawImage(this.sceneC, 0, 0, this.vw, this.vh, 0, 0, this.vw * sc, this.vh * sc);
      const band = 2;
      const t = this.time;
      for (let y = 0; y < this.vh; y += band) {
        // stronger toward the top of the screen, where the "distance" is
        const depth = 1 - y / this.vh;
        const amp = haze * (0.5 + depth * 1.8);
        const off = Math.round(
          (Math.sin(y * 0.21 + t * 2.3) * 0.7 + Math.sin(y * 0.07 - t * 1.3) * 0.5) * amp
        );
        const hh = Math.min(band, this.vh - y);
        d.drawImage(this.sceneC, 0, y, this.vw, hh, off * sc, y * sc, this.vw * sc, hh * sc);
      }
    }

    // UI on top, never distorted
    d.drawImage(this.uiC, 0, 0, this.vw, this.vh, 0, 0, this.vw * sc, this.vh * sc);

    if (this.fade > 0.002) {
      d.globalAlpha = clamp01(this.fade);
      d.fillStyle = this.fadeColor;
      d.fillRect(0, 0, this.display.width, this.display.height);
      d.globalAlpha = 1;
    }
  }

  update(dt, weather) {
    this.hazeAmount = lerp(this.hazeAmount, weather.haze * 2.1, 1 - Math.pow(0.05, dt));
    this.flash = Math.max(0, this.flash - dt * 2.6);
  }

  doFlash(color = '#ffffff', amount = 0.7) { this.flashColor = color; this.flash = amount; }
}
