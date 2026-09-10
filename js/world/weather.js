// CRABDEN - time of day, wind and weather, published as the handful of
// numbers the renderer and the backdrop actually need.

import { clamp, clamp01, lerp, wobble, Rng } from '../lib/math.js';

export const DAY_SECONDS = 480;

const KEYS = [
  //  hour   ambient tint        daylight  night
  [0.0, '#1b2340', 0.00, 1.00],
  [4.6, '#243052', 0.02, 0.94],
  [5.9, '#6b5a7e', 0.14, 0.60],
  [6.7, '#e8a074', 0.38, 0.24],
  [8.0, '#ffe4c0', 0.82, 0.04],
  [12.0, '#fffbf2', 1.00, 0.00],
  [15.5, '#fff2d8', 0.96, 0.00],
  [17.6, '#ffc98c', 0.66, 0.06],
  [18.7, '#f08a52', 0.34, 0.26],
  [19.7, '#7a5f78', 0.12, 0.62],
  [21.0, '#26304e', 0.02, 0.95],
  [24.0, '#1b2340', 0.00, 1.00],
];

export const WEATHER_KINDS = {
  clear: { name: 'Clear', min: 80, max: 200, cloud: 0.25 },
  sandstorm: { name: 'Sandstorm', min: 45, max: 90, wind: 2.6, haze: 0.5, fog: 0.7, cloud: 0.5, drain: 1.6, danger: true },
  heatwave: { name: 'Heat Shimmer', min: 50, max: 100, wind: 0.25, haze: 2.0, fog: 0.1, cloud: 0.05, drain: 2.0, dayOnly: true },
  rain: { name: 'Rain', min: 40, max: 80, wind: 1.2, haze: 0, fog: 0.3, cloud: 0.95, drain: -3, rare: true },
  overcast: { name: 'Overcast', min: 60, max: 130, wind: 0.7, haze: 0.2, fog: 0.2, cloud: 0.8, drain: -0.4 },
  lightning: { name: 'Dry Lightning', min: 35, max: 70, wind: 1.7, haze: 0.4, fog: 0.35, cloud: 0.85, drain: 0.3, danger: true },
};

function sample(hour) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (hour >= a[0] && hour <= b[0]) {
      const t = (hour - a[0]) / (b[0] - a[0]);
      return { color: lerpHex(a[1], b[1], t), day: lerp(a[2], b[2], t), night: lerp(a[3], b[3], t) };
    }
  }
  return { color: KEYS[0][1], day: 0, night: 1 };
}

function lerpHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

export class Weather {
  constructor(seed = 5) {
    this.rng = new Rng(seed);
    this.t = 7.4 / 24 * DAY_SECONDS;
    this.time = 0;
    this.day = 1;
    this.kind = 'clear';
    this.kindT = 0;
    this.kindDur = 120;
    this.intensity = 0;
    this.windDir = 1;
    this.windSpeed = 0.5;
    this.gust = 0;
    this.lightningFlash = 0;
    this.lightningTimer = 5;
    this.forced = 0;
    this.paused = false;
    this.recompute();
  }

  get hour() { return (this.t / DAY_SECONDS) * 24 % 24; }
  set hour(h) { this.t = (h / 24) * DAY_SECONDS; }
  get isNight() { return this.nightMix > 0.55; }

  update(dt, game) {
    this.time += dt;
    if (!this.paused) {
      const prev = this.hour;
      this.t += dt;
      if (this.t >= DAY_SECONDS) { this.t -= DAY_SECONDS; this.day++; game?.onNewDay?.(this.day); }
      const h = this.hour;
      if (h >= 19.4 && prev < 19.4) game?.onDusk?.();
      if (h >= 6.2 && prev < 6.2) game?.onDawn?.();
    }

    this.kindT += dt;
    if (this.forced > 0) {
      this.forced -= dt;
    } else if (this.kindT > this.kindDur) {
      this._pick(game);
    }
    this.intensity = Math.min(clamp01(this.kindT / 9), clamp01((this.kindDur - this.kindT) / 9));

    const spec = WEATHER_KINDS[this.kind];
    this.windSpeed = lerp(this.windSpeed, 0.35 + (spec.wind || 0) * this.intensity, 1 - Math.pow(0.25, dt));
    this.gust = 0.6 + wobble(this.time * 0.7) * 0.5 + wobble(this.time * 2.3, 3) * 0.2;

    this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.4);
    if (this.kind === 'lightning' && this.intensity > 0.4) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = this.rng.float(3, 9);
        this.lightningFlash = 1;
        game?.audio?.play('thunder');
        game?.cam?.shake(3);
      }
    }
    this.recompute();
  }

  _pick(game) {
    const night = this.isNight;
    const pool = [{ k: 'clear', w: 7 }, { k: 'overcast', w: 2 }, { k: 'sandstorm', w: 2.6 }];
    if (!night) pool.push({ k: 'heatwave', w: 2.4 });
    pool.push({ k: 'lightning', w: 1.2 });
    pool.push({ k: 'rain', w: (game?.eco?.tier?.t || 0) >= 3 ? 1.6 : 0.25 });
    const choice = this.rng.weighted(pool.filter((p) => p.k !== this.kind));
    this.kind = choice.k;
    this.kindT = 0;
    const spec = WEATHER_KINDS[this.kind];
    this.kindDur = this.rng.float(spec.min, spec.max);
    if (this.kind !== 'clear') game?.onWeather?.(this.kind);
  }

  force(kind, dur = 55) {
    this.kind = kind; this.kindT = 0; this.kindDur = dur; this.forced = dur;
  }

  recompute() {
    const s = sample(this.hour);
    this.ambientColor = s.color;
    this.daylight = s.day;
    this.nightMix = s.night;

    const spec = WEATHER_KINDS[this.kind];
    this.cloudCover = lerp(0.25, spec.cloud ?? 0.25, this.intensity);
    this.haze = clamp01(((spec.haze ?? 0.7) * this.intensity + 0.5 * (1 - this.intensity)) * (0.2 + this.daylight));
    this.fog = (spec.fog || 0) * this.intensity;
    this.rain = this.kind === 'rain' ? this.intensity : 0;
    this.sand = this.kind === 'sandstorm' ? this.intensity : 0;
    this.waterDrain = 1 + (spec.drain || 0) * this.intensity * 0.5;
    this.dangerous = !!spec.danger && this.intensity > 0.5;

    // sun direction for the world's own shading
    const elev = Math.sin(Math.PI * clamp01((this.hour - 5.6) / 13));
    this.sunElev = this.hour > 5.6 && this.hour < 18.6 ? elev : 0;
    this.shadowDir = this.hour < 12 ? 1 : -1;
    this.shadowLen = this.sunElev > 0.05 ? clamp(2.4 / Math.max(0.2, this.sunElev), 2, 12) : 3;
    this.shadowAlpha = clamp01(this.sunElev * 1.2) * 0.45 + 0.08;
  }

  windVec() {
    const s = this.windSpeed * (0.7 + this.gust * 0.5);
    return { x: this.windDir * s, y: 0, s };
  }

  label() {
    return this.kind === 'clear' ? (this.isNight ? 'Clear Night' : 'Clear') : WEATHER_KINDS[this.kind].name;
  }

  serialize() { return { t: this.t, day: this.day, kind: this.kind, kindT: this.kindT, kindDur: this.kindDur }; }
  deserialize(d) {
    if (!d) return;
    this.t = d.t ?? this.t; this.day = d.day ?? 1;
    this.kind = d.kind || 'clear'; this.kindT = d.kindT || 0; this.kindDur = d.kindDur || 120;
    this.recompute();
  }
}
