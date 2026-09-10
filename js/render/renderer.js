// CRABDEN - layered renderer.
//   scene  the world at low resolution
//   light  ambient tint plus additive lights, multiplied over the scene
//   ui     HUD and dialogue, blitted last so the heat haze never wobbles text

import { clamp, clamp01, lerp, mixHex, rgba } from '../lib/math.js';
import { hash2i } from './pixel.js';

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
    const vh = Math.ceil(h / scale);
    this.scale = scale;
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

  composite(weather, game) {
    const s = this.scene;
    s.globalCompositeOperation = 'multiply';
    s.drawImage(this.lightC, 0, 0);
    s.globalCompositeOperation = 'source-over';

    this.drawWeatherOverlay(weather, game);

    if (!this._vignette) this._buildVignette();
    s.drawImage(this._vignette, 0, 0);

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
    if (haze < 0.02) {
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
        const off = Math.round((Math.sin(y * 0.23 + t * 2.4) * 0.7 + Math.sin(y * 0.08 - t * 1.4) * 0.5) * amp);
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
