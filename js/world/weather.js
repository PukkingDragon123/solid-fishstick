// CRABDEN - time of day, wind, and the weather that rolls over the desert.
// Everything the renderer needs for atmosphere is published on this object.

import { clamp, clamp01, lerp, mixHex, wobble, Rng } from '../lib/math.js';
// One in-game day per DAY_SECONDS of real time.
export const DAY_SECONDS = 420;

const AMBIENT_KEYS = [
  [0.0,  '#243056', 0.00],
  [4.5,  '#2b3a63', 0.00],
  [5.8,  '#6a5a82', 0.05],
  [6.6,  '#f0a874', 0.30],
  [8.0,  '#ffe6c6', 0.80],
  [11.0, '#fffaf0', 1.00],
  [13.5, '#ffffff', 1.00],
  [16.5, '#ffe2b4', 0.86],
  [18.4, '#ff9f66', 0.42],
  [19.5, '#c2714f', 0.18],
  [20.6, '#5a5486', 0.04],
  [22.0, '#2a3a63', 0.00],
  [24.0, '#243056', 0.00],
];

function sampleKeys(hour) {
  for (let i = 0; i < AMBIENT_KEYS.length - 1; i++) {
    const a = AMBIENT_KEYS[i], b = AMBIENT_KEYS[i + 1];
    if (hour >= a[0] && hour <= b[0]) {
      const t = (hour - a[0]) / (b[0] - a[0]);
      return { color: mixHex(a[1], b[1], t), day: lerp(a[2], b[2], t) };
    }
  }
  return { color: AMBIENT_KEYS[0][1], day: 0 };
}

export const WEATHER_KINDS = {
  clear:     { name: 'Clear',         min: 60, max: 180 },
  sandstorm: { name: 'Sandstorm',     min: 40, max: 80,  wind: 2.4, haze: 0.4, fog: 0.75, drain: 1.6, danger: true },
  heatwave:  { name: 'Heat Shimmer',  min: 45, max: 90,  wind: 0.3, haze: 1.9, fog: 0.12, drain: 2.1, dayOnly: true },
  rain:      { name: 'Rain',          min: 30, max: 60,  wind: 1.1, haze: 0.0, fog: 0.35, drain: -3.0, rare: true },
  lightning: { name: 'Dry Lightning', min: 30, max: 55,  wind: 1.6, haze: 0.5, fog: 0.4, drain: 0.4, danger: true },
  fogbank:   { name: 'Bone Fog',      min: 50, max: 100, wind: 0.4, haze: 0.1, fog: 0.85, drain: -0.4, nightOnly: true },
};

export class Weather {
  constructor(world, seed = 1) {
    this.world = world;
    this.rng = new Rng(seed ^ 0x1d3a);
    this.time = 7.2 / 24 * DAY_SECONDS;  // start mid-morning
    this.day = 1;
    this.kind = 'clear';
    this.kindT = 0;
    this.kindDur = 90;
    this.intensity = 0;
    this.windDir = 0.6;
    this.windSpeed = 0.5;
    this.gust = 0;
    this._gustT = 0;
    this.forcedRain = 0;
    this.lightningFlash = 0;
    this.lightningTimer = 4;
    this.paused = false;
    this.recompute();
  }

  get hour() { return (this.time / DAY_SECONDS) * 24 % 24; }
  set hour(h) { this.time = (h / 24) * DAY_SECONDS; }
  get isNight() { const h = this.hour; return h < 5.9 || h > 19.8; }
  get isDusk() { const h = this.hour; return h > 18.2 && h < 20.4; }
  get isDawn() { const h = this.hour; return h > 5.4 && h < 7.4; }

  /** 0 at midnight, 1 at noon. */
  get daylight() { return this.ambientDay; }

  update(dt, game) {
    if (!this.paused) {
      const prevHour = this.hour;
      this.time += dt;
      if (this.time >= DAY_SECONDS) { this.time -= DAY_SECONDS; this.day++; }
      const h = this.hour;
      const wrapped = h < prevHour;
      if (wrapped) game?.onNewDay?.(this.day);
      if (!wrapped && prevHour < 19.8 && h >= 19.8) game?.onDusk?.();
      if (!wrapped && prevHour < 6.0 && h >= 6.0) game?.onDawn?.();
    }

    // weather scheduling
    this.kindT += dt;
    if (this.forcedRain > 0) {
      this.forcedRain -= dt;
      if (this.kind !== 'rain') { this.kind = 'rain'; this.kindT = 0; this.kindDur = this.forcedRain; }
    } else if (this.kindT > this.kindDur) {
      this._pickWeather(game);
    }

    // ease intensity in and out over the event's lifetime
    const inT = clamp01(this.kindT / 8);
    const outT = clamp01((this.kindDur - this.kindT) / 8);
    this.intensity = Math.min(inT, outT);

    // wind: slow direction drift, gusts on top
    this._gustT += dt;
    this.windDir += Math.sin(this._gustT * 0.07) * dt * 0.12;
    const spec = WEATHER_KINDS[this.kind];
    const targetWind = 0.35 + (spec.wind || 0) * this.intensity;
    this.windSpeed = lerp(this.windSpeed, targetWind, 1 - Math.pow(0.2, dt));
    this.gust = 0.6 + wobble(this._gustT * 0.6) * 0.55 + wobble(this._gustT * 2.1, 3) * 0.2;

    // lightning
    this.lightningFlash = Math.max(0, this.lightningFlash - dt * 3.6);
    if (this.kind === 'lightning' && this.intensity > 0.4) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = this.rng.float(2.5, 8);
        this.lightningFlash = 1;
        game?.audio?.play('thunder');
        game?.cam?.addShake(2.5);
      }
    }

    this.recompute();
  }

  _pickWeather(game) {
    const night = this.isNight;
    const ecoTier = game?.eco?.tier?.t || 0;
    const regionId = game?.currentRegionId || 'dunes';
    const entries = [];
    entries.push({ k: 'clear', w: 6 });
    entries.push({ k: 'sandstorm', w: regionId === 'dunes' || regionId === 'saltpan' ? 3 : 2 });
    if (!night) entries.push({ k: 'heatwave', w: regionId === 'glassflats' ? 4 : 2 });
    if (night) entries.push({ k: 'fogbank', w: regionId === 'bonereef' ? 4 : 1.5 });
    entries.push({ k: 'lightning', w: regionId === 'glassflats' ? 3.5 : 1 });
    entries.push({ k: 'rain', w: ecoTier >= 4 ? 1.6 : ecoTier >= 2 ? 0.4 : 0.05 });
    // never run the same event twice in a row
    const pool = entries.filter((e) => e.k !== this.kind);
    const pick = this.rng.weighted(pool.map((e) => ({ w: e.w, k: e.k })));
    this.kind = pick.k;
    this.kindT = 0;
    const spec = WEATHER_KINDS[this.kind];
    this.kindDur = this.rng.float(spec.min, spec.max);
    if (this.kind !== 'clear') game?.onWeather?.(this.kind);
  }

  /** Force a weather event (Mirage Jelly rain, story beats). */
  force(kind, dur = 45) {
    this.kind = kind;
    this.kindT = 0;
    this.kindDur = dur;
    if (kind === 'rain') this.forcedRain = dur;
  }

  recompute() {
    const h = this.hour;
    const k = sampleKeys(h);
    this.ambientColor = k.color;
    this.ambientDay = k.day;

    // sun elevation drives shadow length and strength
    const elev = Math.sin(Math.PI * clamp01((h - 5.7) / 12.6));
    this.sunElev = h > 5.7 && h < 18.3 ? elev : 0;
    const az = Math.PI * clamp01((h - 5.7) / 12.6);
    const len = this.sunElev > 0.02 ? clamp(2.2 / Math.max(0.18, this.sunElev), 2.2, 13) : 0;
    this.shadow = {
      x: Math.cos(az) * len,
      y: 0.42 * len + 1.2,
      len,
      strength: clamp01(this.sunElev * 1.35) * (1 - (WEATHER_KINDS[this.kind].fog || 0) * this.intensity * 0.8),
    };
    // moonlight gives a faint opposite-side shadow at night
    if (this.sunElev <= 0.02) {
      this.shadow.x = -3;
      this.shadow.y = 2.4;
      this.shadow.strength = 0.16;
    }

    const spec = WEATHER_KINDS[this.kind];
    this.haze = clamp01(((spec.haze ?? 0.85) * this.intensity + 0.55 * (1 - this.intensity)) * (0.25 + this.sunElev * 0.95));
    this.fog = (spec.fog || 0) * this.intensity;
    this.rain = this.kind === 'rain' ? this.intensity : 0;
    this.sand = this.kind === 'sandstorm' ? this.intensity : 0;
    this.waterDrainMult = 1 + (spec.drain || 0) * this.intensity * 0.5;
    this.dangerous = !!spec.danger && this.intensity > 0.5;
  }

  windVec() {
    const s = this.windSpeed * (0.7 + this.gust * 0.5);
    return { x: Math.cos(this.windDir) * s, y: Math.sin(this.windDir) * s * 0.45, s };
  }

  label() {
    const spec = WEATHER_KINDS[this.kind];
    return this.kind === 'clear' ? (this.isNight ? 'Clear Night' : 'Clear') : spec.name;
  }

  serialize() { return { time: this.time, day: this.day, kind: this.kind, kindT: this.kindT, kindDur: this.kindDur }; }
  deserialize(d) {
    if (!d) return;
    this.time = d.time ?? this.time;
    this.day = d.day ?? 1;
    this.kind = d.kind || 'clear';
    this.kindT = d.kindT || 0;
    this.kindDur = d.kindDur || 90;
    this.recompute();
  }
}
