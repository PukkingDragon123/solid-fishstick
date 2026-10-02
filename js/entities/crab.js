// CRABDEN - the player crab.
//
// It faces you. Crabs do not turn to walk, so the body stays square to the
// camera and the animal goes sideways underneath it: the legs on the leading
// side reach out and pull, the trailing side pushes, and the shell rocks
// across the gait. Nothing is a sprite animation - every foot is planted in
// world space and every joint is solved.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { pxDisc, pxGlow, pxEllipse } from '../render/pix.js';
import { buildCrab, crabMetrics } from '../art/crabart.js';
import { MATERIALS } from '../lib/palette.js';

// colours as packed pixels, so a leg is written straight into a buffer
const u32 = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
};
const OUT_NEAR = u32('#171009'), OUT_FAR = u32('#100a06');
const BARN_HI = u32('#e8e0cc'), BARN_LO = u32('#a89c84'), GRAN_HI = u32('#f6dcc0');
const rampCache = new Map();
function rampU32(ramp) {
  let r = rampCache.get(ramp);
  if (!r) { r = ramp.map(u32); rampCache.set(ramp, r); }
  return r;
}
const LIMB = 256;
const MOSS_N = 70;
let limb = null;
function limbBuf() {
  if (!limb) {
    const cv = document.createElement('canvas');
    cv.width = LIMB; cv.height = LIMB;
    const g = cv.getContext('2d');
    const img = g.createImageData(LIMB, LIMB);
    limb = { cv, g, img, u32: new Uint32Array(img.data.buffer) };
  }
  return limb;
}

// Every limb is handed to the screen on its own canvas. Safari can put off a
// drawImage until the frame is flushed, so one shared canvas reused for
// every limb came out as twenty copies of whichever limb was painted last
// (the claw's tip) - that was the fan of spiky claws on the title screen.
// A ring this long is never lapped within a frame.
const LIMB_RING = [];
let limbSlot = 0;
function limbOut(w, h) {
  limbSlot = (limbSlot + 1) % 96;
  let o = LIMB_RING[limbSlot];
  if (!o) {
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 8;
    o = LIMB_RING[limbSlot] = { cv, g: cv.getContext('2d') };
  }
  if (o.cv.width < w || o.cv.height < h) {
    o.cv.width = Math.max(o.cv.width, w); o.cv.height = Math.max(o.cv.height, h);
  }
  return o;
}

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));

/** Two-bone IK. `up` picks which side the joint folds toward. */
export function ik2(hx, hy, tx, ty, l1, l2, up = 1) {
  const dx = tx - hx, dy = ty - hy;
  const d = Math.hypot(dx, dy) || 0.001;
  const dmin = Math.abs(l1 - l2) + 0.01;
  const dmax = l1 + l2 - 0.01;
  const dc = clamp(d, dmin, dmax);
  const a = Math.atan2(dy, dx);
  const cosB = (l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc);
  const b = Math.acos(clamp(cosB, -1, 1));
  const a1 = a - b * up;
  const kx = hx + Math.cos(a1) * l1, ky = hy + Math.sin(a1) * l1;
  const a2 = Math.atan2((hy + Math.sin(a) * dc) - ky, (hx + Math.cos(a) * dc) - kx);
  return { a1, a2, kx, ky, reached: d <= dmax };
}

export class Crab {
  constructor(game, stage = 'hatchling') {
    this.game = game;

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.facing = 1;            // which way it is travelling
    this.faceT = 1;             // kept for callers; the body turns instead
    this.turnDir = 1;           // which shoulder is leading
    this.turnFrom = 1;
    this.turnP = 1;             // 0..1 through the pivot; 1 is settled
    this.lean = 0;
    this.roll = 0;
    this.lurch = 0;
    this.breathe = Math.random() * TAU;
    this.bodyAngle = 0;
    this.bob = 0;
    this.bobT = 0;
    this.crouch = 0;

    this.pumping = 0;
    this.pumpT = 0;
    this.clawT = 0;
    this.clawOpen = 0;
    this.tapT = 0;
    this.smashT = 0;            // 1 at the start of a swing at a rock, runs down to 0
    this.tapLong = false;
    this.look = { x: 0, y: -0.2 };
    this.lookT = 0;
    this.idleLook = null;
    this.blink = 0;
    this.blinkT = 2;
    this.mouthT = Math.random() * TAU;
    this.alarm = 0;
    this.threat = null;

    this.hp = 120;
    this.hpMax = 120;
    this.iframe = 0;

    this.setStage(stage, true);
  }

  setStage(stage, snap = false) {
    this.stage = stage;
    this.rig = buildCrab(stage);
    this.m = this.rig.m;
    this.S = this.rig.S;
    // a hermit crab carries its shell just clear of the sand, not up on stilts
    // measured from the shell's real bottom edge, so a shell of any size
    // rests a hair above the ground
    this.standH = Math.max(0.6, this.m.shellW * 0.015) + (this.m.carry || 0) - (this.m.oy - this.m.rimY);   // the shell carried just clear of the sand
    this.speed = lerp(48, 100, this.m.t);
    this._mossInit();
    this._buildLegs();
    if (snap && this.game && this.game.terrain) this.snapToGround();
  }

  // -- moss -----------------------------------------------------------------
  // Moss creeps over the shell the way paint goes on with a brush: one stroke
  // at a time, each one drawn out along its length as it grows, the next
  // usually starting where an old one ended. The strokes are laid out in the
  // shell's own proportions, so the same moss is still there when it grows.

  _mossInit() {
    const body = this.rig.body, m = this.m;
    const w = body.cv.width, h = body.cv.height;
    // read from a throwaway copy: reading the sprite itself back can move it
    // off the GPU, and it is drawn every frame
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const tg = tmp.getContext('2d', { willReadFrequently: true });
    tg.drawImage(body.cv, 0, 0);
    const src = tg.getImageData(0, 0, w, h).data;
    const ok = new Uint8Array(w * h);
    const apx = body.ox + m.ap.x, apy = body.oy + m.ap.y;
    const org = this.rig.sockets.organ;
    const ogx = body.ox + org.x, ogy = body.oy + org.y, ogr = Math.max(3, m.rx * 0.16);
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (src[i * 4 + 3] < 200) continue;
        // keep off the outline, the mouth of the shell and the water organ
        if (src[(i - 1) * 4 + 3] < 200 || src[(i + 1) * 4 + 3] < 200 || src[(i - w) * 4 + 3] < 200 || src[(i + w) * 4 + 3] < 200) continue;
        if (((x - apx) / (m.ap.rx * 1.35)) ** 2 + ((y - apy) / (m.ap.ry * 1.25)) ** 2 < 1) continue;
        if (Math.hypot(x - ogx, (y - ogy) * 1.6) < ogr) continue;
        ok[i] = 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    this.mossCv = cv;
    this._mz = { w, h, ok, g, img: g.createImageData(w, h), box: { x0, x1, y0, y1 }, drawn: -1, t: 0 };
    if (this.moss == null) this.moss = 0.06;
    this._mossPaint();
  }

  /** The brush strokes, the same every time: in shell-box units, 0..1. */
  _mossStrokes() {
    if (Crab._strokes) return Crab._strokes;
    const R = (n) => { let h = Math.imul(n | 0, 0x27d4eb2d); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
    const out = [];
    for (let i = 0; i < MOSS_N; i++) {
      let sx, sy;
      if (i > 2 && R(i * 7 + 1) < 0.7) {
        // carry on from where an earlier stroke stopped
        const p = out[Math.floor(R(i * 13 + 2) * i)];
        sx = p.ex + (R(i * 5 + 3) - 0.5) * 0.08; sy = p.ey + (R(i * 11 + 4) - 0.5) * 0.08;
      } else {
        // it takes hold low down and in the grooves first, then climbs
        sx = R(i * 17 + 5); sy = 0.45 + R(i * 19 + 6) * 0.55 - Math.min(0.45, i / MOSS_N * 0.6);
      }
      const ang = (R(i * 23 + 7) - 0.5) * 1.6 + (R(i * 29 + 8) < 0.5 ? Math.PI : 0);
      const len = 0.10 + R(i * 31 + 9) * 0.22;
      const pts = [];
      let x = sx, y = sy, a = ang;
      for (let k = 0; k <= 10; k++) {
        pts.push({ x, y });
        a += (R(i * 37 + k * 3) - 0.5) * 0.7;
        x += Math.cos(a) * len / 10; y += Math.sin(a) * len / 10 * 0.8;
      }
      out.push({ pts, ex: x, ey: y, w: 0.6 + R(i * 41 + 10) * 0.8, tone: R(i * 43 + 11) });
    }
    return (Crab._strokes = out);
  }

  _mossPaint() {
    const z = this._mz; if (!z) return;
    const { w, h, ok, box } = z;
    const n = this.moss * MOSS_N;
    const full = Math.floor(n), part = n - full;
    const key = Math.round(n * 12);
    if (key === z.drawn) return;
    z.drawn = key;
    const mask = new Uint8Array(w * h);
    const strokes = this._mossStrokes();
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    for (let i = 0; i <= Math.min(full, MOSS_N - 1); i++) {
      const st = strokes[i];
      const upto = i < full ? 1 : part;
      if (upto <= 0) continue;
      const last = Math.max(1, Math.round(upto * 10));
      for (let k = 0; k <= last; k++) {
        const p = st.pts[Math.min(10, k)];
        // a brush: fat in the middle of the stroke, dragged thin at the ends
        const taper = Math.sin(Math.PI * (0.15 + 0.7 * (k / 10)));
        const r = Math.max(0.8, (0.012 + st.w * 0.030 * taper) * bw);
        const cx = box.x0 + p.x * bw, cy = box.y0 + p.y * bh;
        const R2 = Math.ceil(r);
        for (let dy = -R2; dy <= R2; dy++) {
          for (let dx = -R2; dx <= R2; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const x = Math.round(cx + dx), y = Math.round(cy + dy);
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const j = y * w + x;
            if (ok[j] && !mask[j]) mask[j] = 1 + Math.floor(st.tone * 3);
          }
        }
      }
    }
    // shade it as a pixel artist would: lit along the top of each patch, a
    // dark lip along the bottom, a speckle of light inside, dithered
    const ramp = MATERIALS.moss.ramp;
    const rgb = ramp.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
    const d = z.img.data; d.fill(0);
    const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 7;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const j = y * w + x;
        if (!mask[j]) {
          // a darker rim where moss meets bare shell below it
          if (ok[j] && mask[j - w]) { const c = rgb[1]; d.set([c[0], c[1], c[2], 190], j * 4); }
          continue;
        }
        const top = !mask[j - w], bot = !mask[j + w];
        const vy = (y - box.y0) / Math.max(1, box.y1 - box.y0);
        let k = 4 + (mask[j] - 2) * 0.6 - vy * 1.6 + (hash(x, y) === 0 ? 1.2 : 0) + (((x + y) & 1) ? 0.35 : -0.35);
        if (top) k += 1.8; if (bot) k -= 1.5;
        k = Math.max(1, Math.min(7, Math.round(k)));
        const c = rgb[k];
        d.set([c[0], c[1], c[2], 255], j * 4);
      }
    }
    z.g.putImageData(z.img, 0, 0);
  }

  _mossTick(dt) {
    const lush = this.game?.garden?.lushness || 0;
    // about a quarter of an hour to cover the shell, faster if it is kept green
    const rate = (1 / 900) * (1 + lush * 2);
    this.moss = Math.min(1, (this.moss ?? 0.06) + rate * dt);
    if (!this._mz) return;
    this._mz.t += dt;
    if (this._mz.t > 0.2) { this._mz.t = 0; this._mossPaint(); }
  }

  _buildLegs() {
    this.legs = this.rig.sockets.legs.map((s, i) => ({
      def: s,
      foot: { x: 0, y: 0 },
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      stepping: false,
      t: 0,
      dur: 0.22,
      lift: 0,
      // opposite sides alternate, so it never has both leading legs in the air
      group: (i + (s.side > 0 ? 1 : 0)) % 2,
    }));
  }

  /** Where this leg wants its foot: a little outboard of its own socket. */
  homeX(l, lead = 0) {
    const sp = Math.abs(l.def.spread || 0.6);
    if (this.rig.hermit) {
      // a hermit crab walks forward out of its shell: one pair reaches ahead
      // of the aperture, the other plants back under it
      const f = this.turnDir >= 0 ? 1 : -1;
      if (l.def.home != null) return this.x + f * l.def.home + lead;
      const ap = this.m.ap || { x: this.m.rx * 0.66 };
      const fx = l.def.side > 0 ? ap.x + this.m.rx * (0.70 + sp * 0.45) : ap.x - this.m.rx * (0.55 + sp * 0.45);
      return this.x + f * fx + lead;
    }
    return this.x + l.def.side * this.m.rx * (0.80 + sp * 0.80) + lead;
  }

  /** Back legs contact further away, so their feet sit higher on screen. */
  footLift(l) { return (l.def.depth || 0) * (this.m.farLift ?? this.m.rx * 0.30); }

  snapToGround() {
    const t = this.game.terrain;
    this.y = t.surfaceY(this.x) - this.standH;
    for (const l of this.legs) {
      const fx = this.homeX(l);
      l.foot.x = fx; l.foot.y = t.surfaceY(fx) - this.footLift(l);
      l.from = { ...l.foot }; l.to = { ...l.foot };
    }
  }

  /** Start a pivot onto the other shoulder. Ignored if one is already running. */
  _startTurn(dir) {
    if (dir === this.turnDir || this.turnP < 0.8) return;
    this.turnFrom = this.turnDir;
    this.turnDir = dir;
    this.turnP = 0;
    this.game.audio?.play('step', { vol: 0.5 });
    if (this.game.fx && this.game.terrain) {
      const gy = this.game.terrain.surfaceY(this.x);
      this.game.fx.dust(this.x, gy - 2, 1.4 + this.m.t * 1.6);
      this.game.terrain.deform(this.x, 1.6, 6 + this.m.rx * 0.16);
    }
  }

  /**
   * How wide the animal reads while it turns. It goes edge-on halfway through
   * and comes back out the other way, which is a pivot rather than a mirror.
   */
  get turnScaleX() {
    if (this.turnP >= 1) return this.turnDir;
    const k = this.turnP;
    const sign = k < 0.5 ? this.turnFrom : this.turnDir;
    return sign * Math.max(0.15, Math.abs(Math.cos(k * Math.PI)));
  }

  /** A little lift out of the sand as it comes round. */
  get turnLift() {
    if (this.turnP >= 1) return 0;
    return -Math.sin(this.turnP * Math.PI) * this.m.rx * 0.10;
  }

  get worldY() { return this.y; }

  /** Where a point on the shell's top surface lands in world space. */
  shellWorldAB(a, b) {
    const p = this.rig.shellSurface(a, b);
    return this.localToWorld(p.x, p.y, p.nx, p.ny);
  }

  shellWorld(u) {
    const p = this.rig.shellPoint(u);
    return this.localToWorld(p.x, p.y, p.nx, p.ny);
  }

  localToWorld(lx, ly, nx = 0, ny = 0) {
    const c = Math.cos(this.bodyAngle + this.roll), s = Math.sin(this.bodyAngle + this.roll);
    const px = lx + this.lean * 3, py = ly;
    return {
      x: this.x + this.lurch * 0.35 + px * c - py * s,
      y: this.y + px * s + py * c + this.bob,
      nx: nx * c - ny * s,
      ny: nx * s + ny * c,
    };
  }

  // -------------------------------------------------------------------------

  update(dt, ctrl = {}) {
    const t = this.game.terrain;
    const move = clamp(ctrl.move || 0, -1, 1);
    const speed = this.speed * (ctrl.speedMul || 1) * (ctrl.sprint ? 1.5 : 1) * (1 - this.crouch * 0.6);

    // A crab still goes sideways, but it does not reverse like a lift: to lead
    // with the other shoulder it has to pivot, and while it is pivoting it is
    // not going anywhere much.
    if (move > 0.1) { this.facing = 1; this._startTurn(1); }
    else if (move < -0.1) { this.facing = -1; this._startTurn(-1); }
    if (this.turnP < 1) this.turnP = Math.min(1, this.turnP + dt / 0.42);

    // -- climbing ----------------------------------------------------------
    // The ground is not flat and the animal weighs what it weighs. Going up a
    // boulder or a rock bench costs you speed, and the steeper it is the more
    // it costs - which is what makes a step in the ground a decision rather
    // than a texture you slide over. Coming back down is free; gravity is on
    // your side and always has been.
    const dir = move > 0.1 ? 1 : move < -0.1 ? -1 : (this.facing || 1);
    const LOOK = this.m.shellW * 0.42 + 8;
    const rise = (t.baseY(this.x) - t.baseY(this.x + dir * LOOK)) / LOOK;
    const grade = clamp01((rise - 0.28) / 1.05);
    this.climb = damp(this.climb || 0, Math.abs(move) > 0.1 ? grade : 0, 0.0008, dt);
    const climbMul = 1 - grade * 0.76;

    // -- and under water ---------------------------------------------------
    // You are a crab. You do not swim; you walk on the bottom, and the water
    // pushes back on everything you do - which is the whole difference in
    // feel between the desert and the shelf.
    const wet = this.game.shallows?.wet || 0;
    const wetMul = 1 - wet * 0.42;

    const pivot = this.turnP < 1 ? 0.16 : 1;
    this.vx = damp(this.vx, move * speed * pivot * climbMul * wetMul, 0.0002, dt);
    if (Math.abs(this.vx) < 0.6) this.vx = 0;
    this.x += this.vx * dt;
    this.lean = damp(this.lean, clamp(this.vx / this.speed, -1, 1) * 0.7, 0.0009, dt);

    this._gait(dt, t);
    this._mossTick(dt);
    this._rideFeet(dt, t);

    const spd = Math.abs(this.vx);
    const run = clamp01(spd / (this.speed * 0.85));
    this.bobT += dt * (2.4 + spd * 0.085);
    this.breathe += dt * (1.1 + run * 1.4);
    const walkBob = Math.sin(this.bobT * 2) * run * this.S * 1.5;
    const idleBob = Math.sin(this.breathe) * this.S * 0.5;
    this.bob = damp(this.bob, walkBob + idleBob, 0.001, dt);
    this.lurch = damp(this.lurch, Math.sin(this.bobT * 2 + 0.9) * run * this.S * 1.6 * this.facing, 0.001, dt);
    // a shell loaded heavier on one side makes the animal walk with a list
    const list = ctrl.list || 0;
    this.roll = damp(this.roll, Math.sin(this.bobT) * run * 0.05 * this.facing + list, 0.0012, dt);
    // going up a face the animal rears: the front comes up, the back stays
    // down, and the legs on the rock throw grit
    // buoyancy: the shell wants to float and the legs will not let it
    if (wet > 0.02) {
      this.bob -= Math.sin(this.breathe * 0.7) * wet * this.S * 1.7;
      this.roll += Math.sin(this.breathe * 0.5) * wet * 0.02;
    }
    if (this.climb > 0.05) {
      this.roll -= this.climb * 0.13 * this.facing;
      this.bob -= this.climb * this.S * 1.4;
      if (Math.random() < dt * this.climb * 14) {
        this.game.fx?.spark?.(this.x + this.facing * this.m.shellW * 0.34,
          t.surfaceY(this.x + this.facing * this.m.shellW * 0.34) - 2, '#b39a74', 2, 22);
      }
    }

    // the eyes go where the attention is, which is usually the way it is going
    this.lookT -= dt;
    let tx = clamp(this.vx / this.speed, -1, 1) * 0.85, ty = -0.30;
    if (this.alarm > 0.1 && this.threat) {
      tx = clamp((this.threat.x - this.x) / 70, -1.2, 1.2);
      ty = clamp((this.threat.y - this.y) / 70, -1, 0.6);
    } else if (this.lookT <= 0) {
      this.lookT = 0.6 + Math.random() * 1.6;
      this.idleLook = { x: (Math.random() - 0.5) * 1.8, y: -0.1 - Math.random() * 0.6 };
    }
    if (spd < 6 && this.alarm < 0.1 && this.idleLook) { tx = this.idleLook.x; ty = this.idleLook.y; }
    this.look.x = damp(this.look.x, tx, 0.0004, dt);
    this.look.y = damp(this.look.y, ty, 0.0004, dt);
    this.eyeLook = this.look.x;
    this.alarm = Math.max(0, this.alarm - dt * 0.7);

    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = 2.2 + Math.random() * 4.5; this.blink = 0.16; }
    this.blink = Math.max(0, this.blink - dt);
    this.mouthT += dt * (5.5 + (this.pumping > 0 ? 9 : 0));

    this.clawT += dt;
    const wantOpen = ctrl.grab ? 1
      : this.alarm > 0.2 ? 0.85 + Math.sin(this.clawT * 9) * 0.15
        : this.pumping > 0 ? 0.7 : 0.34 + Math.sin(this.clawT * 1.3) * 0.10;
    this.clawOpen = damp(this.clawOpen, wantOpen, 0.001, dt);

    this.pumping = Math.max(0, this.pumping - dt);
    this.tapT = Math.max(0, this.tapT - dt * 3.2);
    this.smashT = Math.max(0, this.smashT - dt * 3.1);
    this.crouch = damp(this.crouch, this.pumping > 0 ? 1 : 0, 0.0009, dt);
  }

  /**
   * THE GAIT. Every foot's position is worked out fresh each frame from one
   * number - how far the crab has walked - rather than from a step that was
   * started some frames ago and may not have finished. That is what makes it
   * impossible for a foot to be left behind: it does not matter how long a
   * frame was, or how slow the device is, the foot is exactly where the
   * cycle says it is.
   *
   *   stance  (60% of the cycle) the foot is planted: it slides back
   *           relative to the body at exactly the speed the body moves, so
   *           in the world it does not move at all
   *   swing   (40%) it lifts, travels forward over the stride, and lands
   *
   * Legs are spread round the cycle a quarter apart, so two are always down.
   * Each foot ranges only half a stride either side of its home, which is
   * always inside the leg's reach - and a final clamp holds it there anyway.
   */
  _gait(dt, t) {
    const STANCE = 0.6;
    const spd = Math.abs(this.vx);
    const stride = this.m.rx * 0.40;
    const cycle = stride / STANCE;          // distance walked per full cycle
    if (spd > 0.5) this.gaitDir = Math.sign(this.vx);
    const dm = this.gaitDir || 1;
    this.gaitP = ((this.gaitP || 0) + (spd * dt) / cycle) % 1;
    // the stride opens out as it walks and folds back in when it stops, so a
    // crab at rest stands square on its homes
    const want = spd > 0.5 ? 1 : 0;
    this.gaitAmp = damp(this.gaitAmp ?? 0, want, want ? 0.02 : 0.004, dt);
    const amp = this.gaitAmp;
    const liftH = this.m.rx * 0.20;
    const turning = this.turnP < 1;
    const rig = this.rig;
    const tsx = this.turnScaleX;
    const OFF = [0, 0.5, 0.25, 0.75];
    this.legs.forEach((l, i) => {
      const p = (this.gaitP + OFF[i % 4]) % 1;
      let u, lift = 0;
      const swing = p >= STANCE;
      if (!swing) u = 0.5 - p / STANCE;
      else {
        const q = (p - STANCE) / (1 - STANCE);
        u = -0.5 + q;
        lift = Math.sin(q * Math.PI) * liftH;
      }
      // a foot coming down: dust, a dent in the sand, the sound of it
      if (l.wasSwing && !swing && amp > 0.3) this._land(l, t);
      l.wasSwing = swing;
      l.stepping = swing && amp > 0.15;
      l.lift = lift * amp;
      const tx = this.homeX(l) + dm * u * stride * amp;
      let ty = t.surfaceY(tx) - this.footLift(l) - l.lift;
      // during a turn the homes swap sides; the feet walk there, not jump
      if (turning) {
        const k = Math.min(1, dt * 12);
        l.foot.x += (tx - l.foot.x) * k;
        l.foot.y += (ty - l.foot.y) * k;
      } else { l.foot.x = tx; l.foot.y = ty; }
      // and the safety net: never further from the hip than the leg reaches
      const art = l.def.art || (l.def.far ? rig.legArt.far : rig.legArt.near);
      const reach = (art.coxa.len + art.femur.len + art.tibia.len) * 0.97;
      const hx = this.x + l.def.x * tsx, hy = this.y + this.bob + l.def.y;
      const dx = l.foot.x - hx, dy = l.foot.y - hy, d = Math.hypot(dx, dy);
      if (d > reach) { l.foot.x = hx + dx / d * reach; l.foot.y = hy + dy / d * reach; }
    });
  }

  _land(l, t) {
    const w = Math.abs(this.vx);
    t.deform(l.foot.x, 1.2 + w * 0.010, 4 + this.m.rx * 0.08);
    if (this.game.fx && (l.def.far || Math.random() < 0.4)) {
      this.game.fx.footPuff(l.foot.x, l.foot.y + this.footLift(l), w * 0.5, l.def.far);
    }
    if (this.game.audio && w > 12 && !l.def.far) this.game.audio.play('step', { vol: 0.3 });
  }

  _rideFeet(dt, t) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    for (const l of this.legs) {
      if (l.stepping) continue;
      const dx = l.foot.x - this.x;
      const fy = l.foot.y + this.footLift(l) + (l.lift || 0);
      sx += dx; sy += fy; sxx += dx * dx; sxy += dx * fy; n++;
    }
    let groundY = t.surfaceY(this.x), slope = 0;
    if (n >= 2) {
      const denom = n * sxx - sx * sx;
      if (Math.abs(denom) > 0.001) slope = (n * sxy - sx * sy) / denom;
      groundY = (sy - slope * sx) / n;
    }
    const targetY = groundY - this.standH * (1 - this.crouch * 0.28);
    this.y = damp(this.y, targetY, 0.0008, dt);
    this.bodyAngle = damp(this.bodyAngle, clamp(Math.atan(slope) * 0.6, -0.25, 0.25), 0.0009, dt);
  }

  /** Something worth watching: sets the gaze and lifts a claw. */
  alertTo(ent, amount = 1) {
    this.threat = ent;
    this.alarm = Math.min(1.4, this.alarm + amount);
  }

  pump() { this.pumping = 0.55; this.pumpT = 0; }

  /** One tap of a claw against your own shell. Long taps swing further. */
  tap(long) {
    this.clawT = 0;
    this.tapT = 1;
    this.tapLong = !!long;
    this.game.audio?.play('claw', { pitch: long ? 0.8 : 1.3 });
  }

  // -------------------------------------------------------------------------

  draw(ctx, cam, garden) {
    const rig = this.rig;
    const sc = cam.zoom;
    const p = cam.worldToScreen(this.x + this.lurch * 0.35, this.y + this.bob);

    this._drawShadow(ctx, cam);

    ctx.save();
    ctx.translate(Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2 + this.turnLift * sc);
    ctx.scale(sc, sc);
    // the pivot: everything hanging off the body squashes and comes back out
    // the other way together, so the garden turns with the animal carrying it
    const tsx = this.turnScaleX;
    if (tsx !== 1) ctx.scale(tsx, 1 + (1 - Math.abs(tsx)) * 0.06);
    const rot = (this.bodyAngle + this.roll) * (tsx < 0 ? -1 : 1);

    // ---- the two rear legs on each side, and anything on the far shell ----
    ctx.save();
    ctx.rotate(rot);
    this._drawLegs(ctx, true);
    ctx.restore();
    if (garden) garden.drawFar(ctx, this);

    // ---- body -------------------------------------------------------------
    ctx.save();
    ctx.rotate(rot);
    ctx.translate(this.lean * 3, 0);
    ctx.scale(1, 1 + Math.sin(this.breathe) * 0.012);
    ctx.drawImage(rig.body.cv, -rig.body.ox, -rig.body.oy);
    if (this.mossCv) ctx.drawImage(this.mossCv, -rig.body.ox, -rig.body.oy);
    ctx.restore();

    // ---- everything growing on the near half of the shell ------------------
    if (garden) garden.drawNear(ctx, this);

    // ---- front legs, claws, face ------------------------------------------
    ctx.save();
    ctx.rotate(rot);
    this._drawLegs(ctx, false);
    this._drawFace(ctx);
    this._drawClaws(ctx);
    ctx.restore();

    ctx.restore();
  }

  _drawLegs(ctx, far) {
    const rig = this.rig;
    // The body is drawn mirrored when it faces the other way, so the feet
    // have to be taken into that mirrored frame too - the old crab was the
    // same both ways round and got away without it; this one is not.
    const tsx = this.turnScaleX;
    const sg = tsx < 0 ? -1 : 1;
    const a = -(this.bodyAngle + this.roll) * sg;
    const c = Math.cos(a), s = Math.sin(a);
    const mx = Math.abs(tsx) < 0.2 ? 0.2 * sg : tsx;

    for (const leg of this.legs) {
      if (!!leg.def.far !== far) continue;
      const art = leg.def.art || (far ? rig.legArt.far : rig.legArt.near);
      const l1 = art.coxa.len, l2 = art.femur.len, l3 = art.tibia.len;
      // Mid-turn the body is squashed flat, and un-squashing the foot to
      // match flung it far out - every leg shot out straight like a spike.
      // As the squash deepens the foot eases over to where that leg stands
      // at rest, in the body's own frame, so the legs fold with the turn.
      const rawX = (leg.foot.x - (this.x + this.lurch * 0.35)) / mx;
      const homeL = leg.def.home ?? rawX;
      const wq = clamp01((Math.abs(tsx) - 0.15) / 0.75);
      const wx = lerp(homeL, rawX, wq);
      const wy = leg.foot.y - (this.y + this.bob);
      const lx = wx * c - wy * s, ly = wx * s + wy * c;
      const hx = leg.def.x, hy = leg.def.y;

      // A short coxa drops out of the socket toward the foot; from its end
      // the two long segments bend to put the tip exactly on the foot, with
      // the knee taken whichever way is higher - up and arched, never
      // buckled under. The foot is never further than the leg is long (the
      // gait sees to that), so the tip always touches the sand it stands on.
      const da = Math.atan2(ly - hy, lx - hx);
      const ca = lerp(Math.PI / 2, da, 0.5);
      const cx = hx + Math.cos(ca) * l1, cy = hy + Math.sin(ca) * l1;
      const s1 = ik2(cx, cy, lx, ly, l2, l3, 1), s2 = ik2(cx, cy, lx, ly, l2, l3, -1);
      const sol = s1.ky <= s2.ky ? s1 : s2;
      const tl = Math.hypot(lx - cx, ly - cy);
      const k = Math.min(1, (l2 + l3 - 0.01) / (tl || 1));
      const ex = cx + (lx - cx) * k, ey = cy + (ly - cy) * k;
      // drawn live on the screen's own pixels rather than as rotated
      // bitmaps: a rotated sprite resamples its pixels unevenly at every
      // angle, which is what made the legs look chewed
      this._limb(ctx, art.coxa, hx, hy, cx, cy);
      this._limb(ctx, art.femur, cx, cy, sol.kx, sol.ky);
      this._limb(ctx, art.tibia, sol.kx, sol.ky, ex, ey);
    }
  }

  /**
   * One leg segment as a shaded capsule, painted pixel by pixel in screen
   * space: a dark outline, lit from above along the top, a cool underside,
   * a ring at each joint, a horn tip on the foot and the odd barnacle.
   */
  _limb(ctx, seg, ax, ay, bx, by) {
    // Rasterised in the crab's own space, scaled up by the zoom, and drawn
    // back through the canvas's current transform. Nothing reads or resets
    // the canvas transform, which some browsers (older Safari on iPad) do
    // not support or get wrong - that is what left legs floating loose.
    const Z = Math.max(0.05, this.game?.cam?.zoom || 1);
    const m = { a: Z, b: 0, c: 0, d: Z, e: 0, f: 0 };
    const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    const p0x = m.a * ax + m.c * ay + m.e, p0y = m.b * ax + m.d * ay + m.f;
    const p1x = m.a * bx + m.c * by + m.e, p1y = m.b * bx + m.d * by + m.f;
    // never thinner than a couple of the sprite's own pixels, or a small
    // crab's legs dissolve into a tangle of one-pixel sticks
    const cl = Math.max(1, sc * 0.6);
    const R0 = Math.max(1.6 * cl, seg.r0 * sc), R1 = Math.max(seg.foot ? 0.9 * cl : 1.3 * cl, seg.r1 * sc);
    const ramp = MATERIALS[seg.mat]?.ramp || MATERIALS.chitin.ramp;
    const horn = MATERIALS.horn?.ramp || ramp;
    const far = seg.far;
    const vx = p1x - p0x, vy = p1y - p0y;
    const len2 = vx * vx + vy * vy || 1;
    const len = Math.sqrt(len2);
    // a slight bow, the way the art had it
    const bow = (seg.bow || 0) * sc;
    const nx = -vy / len, ny = vx / len;
    const pad = Math.max(R0, R1) + Math.abs(bow) + 2;
    // the sprite's own pixel size on screen: limbs are laid on that grid so
    // they are exactly as chunky as the body they hang off
    const cell = Math.max(1, sc * 0.6);
    const x0 = Math.floor((Math.min(p0x, p1x) - pad) / cell), x1 = Math.ceil((Math.max(p0x, p1x) + pad) / cell);
    const y0 = Math.floor((Math.min(p0y, p1y) - pad) / cell), y1 = Math.ceil((Math.max(p0y, p1y) + pad) / cell);
    const out = far ? OUT_FAR : OUT_NEAR;
    const rings = seg.foot ? 1 : 2;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw <= 0 || bh <= 0 || bw > LIMB || bh > LIMB) return;
    const buf = limbBuf();
    const px32 = buf.u32;
    for (let r = 0; r < bh; r++) px32.fill(0, r * LIMB, r * LIMB + bw);
    const pal = rampU32(ramp), hpal = rampU32(horn);
    for (let y = y0; y <= y1; y++) {
      const row = (y - y0) * LIMB;
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) * cell - p0x, py = (y + 0.5) * cell - p0y;
        let t = (px * vx + py * vy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const off = bow * 4 * t * (1 - t);
        const qx = px - vx * t + nx * off, qy = py - vy * t + ny * off;
        const d2 = qx * qx + qy * qy;
        const r = seg.foot ? lerp(R0, R1, Math.pow(t, 0.8)) : lerp(R0, R1, t);
        const rr = r + (!seg.foot && t < 0.12 ? r * 0.12 : 0);
        if (d2 > (rr + 0.35 * cell) * (rr + 0.35 * cell)) {
          // stiff bristles along the top edge of the leg, every few pixels
          if (!seg.foot && qy < 0 && d2 < (rr + 1.6 * cell) * (rr + 1.6 * cell) && Math.abs(qx) < rr * 0.5
            && ((Math.floor(t * len / (2.5 * cell))) & 1) === 0 && t > 0.15 && t < 0.92) px32[row + (x - x0)] = out;
          continue;
        }
        const d = Math.sqrt(d2);
        let c;
        if (d > rr - 0.75 * cell) c = out;
        else {
          const ux = qx / rr, uy = qy / rr;
          const z = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
          let l = -uy * 0.55 - ux * 0.25 + z * 0.55 + 0.18;
          if (far) l -= 0.22;
          const ringT = (t * rings) % 1;
          if (!seg.foot && rings > 1 && t > 0.15 && ringT < 0.12) l -= 0.25;
          const b = BAYER4[y & 3][x & 3];
          let k = Math.floor(clamp01(l) * 6.99 + (b - 0.5) * 0.9);
          k = k < 1 ? 1 : k > 7 ? 7 : k;
          c = (seg.foot && t > 0.72 ? hpal : pal)[k];
          if (seg.gran && !(seg.foot && t > 0.72)) {
            // studs: a grid of round bumps along the limb, each tipped pale
            const gu = t * len / (2.6 * cell), gv = (uy + 1) * rr / (2.6 * cell) + (Math.floor(gu) & 1) * 0.5;
            const du = gu - Math.floor(gu) - 0.5, dv = gv - Math.floor(gv) - 0.5;
            const gd = du * du + dv * dv;
            if (gd < 0.05 && l > 0.3) c = GRAN_HI; else if (gd < 0.11) c = (seg.foot ? hpal : pal)[Math.min(7, k + 1)];
          }
          if (seg.barn && uy < -0.35 && Math.abs(t - 0.5) < 0.06 && ux * ux < 0.15) c = uy < -0.7 ? BARN_HI : BARN_LO;
        }
        px32[row + (x - x0)] = c;
      }
    }
    const o = limbOut(bw, bh);
    o.g.clearRect(0, 0, bw + 1, bh + 1);
    o.g.putImageData(buf.img, 0, 0, 0, 0, bw, bh);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const k = cell / Z;
    ctx.drawImage(o.cv, 0, 0, bw, bh, x0 * k, y0 * k, bw * k, bh * k);
    ctx.restore();
  }

  _seg(ctx, seg, x, y, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.drawImage(seg.cv, -seg.ox, -seg.oy);
    ctx.restore();
  }

  /**
   * A swing at a rock: up and back, then down on it hard, then it comes back
   * up off the stone. The ground stops the claw, so the bottom of the slam
   * is the claw resting on whatever it hit.
   */
  _smashRaise() {
    if (this.smashT <= 0) return 0;
    const p = 1 - this.smashT;
    if (p < 0.42) return Math.sin((p / 0.42) * Math.PI / 2) * 1.7;
    if (p < 0.58) return lerp(1.7, -1.0, (p - 0.42) / 0.16);
    return lerp(-1.0, 0, (p - 0.58) / 0.42);
  }

  _drawClaws(ctx) {
    const rig = this.rig;
    const tm = this.game.time || 0;
    // the small claw behind, the big one in front
    for (const so of rig.sockets.claws) {
      const near = !!so.near;
      const art = near ? rig.claw.near : rig.claw.far;
      const k = so.k || 1;
      const sw = Math.sin(this.clawT * (near ? 1.07 : 0.83)) * 0.06;
      const raise = this.clawOpen * 0.5 + this.pumping * 0.6 + this.alarm * 0.5
        + (near ? Math.sin(this.tapT * Math.PI) * (this.tapLong ? 0.85 : 0.5) : 0)
        + (near ? this._smashRaise() : 0);
      ctx.save();
      ctx.translate(so.x, so.y);
      // they hang down in front of the shell, the palm upright and the
      // fingers to the ground - lifted when it is busy
      // the whole limb swings up as one piece about the shoulder - lifting
      // each joint by its own amount is what folded it into a knot
      let lift = Math.min(this.smashT > 0 && near ? 1.7 : 1, raise) * 0.75;
      const K0 = Math.max(8, this.m.shellW * this.m.clawScale) * k;
      // the ground, in this frame: the claw swings up until it rests on it
      // rather than sinking into the sand
      const groundY = this.standH - so.y - 0.5;
      let a1, ex, ey, a2, fx, fy, a3;
      for (let it = 0; it < 10; it++) {
        a1 = 0.40 + sw - lift + this.crouch * 0.12;
        ex = Math.cos(a1) * art.arm.len; ey = Math.sin(a1) * art.arm.len;
        a2 = a1 + 0.50;
        fx = ex + Math.cos(a2) * art.fore.len * k; fy = ey + Math.sin(a2) * art.fore.len * k;
        a3 = a2 + 0.35 + Math.sin(this.clawT * 1.9 + (near ? 0 : 2)) * 0.04;
        const tipY = fy + Math.sin(a3) * K0 * 0.86 + K0 * 0.12;
        if (tipY <= groundY) break;
        lift += 0.12;
      }
      this._limb(ctx, art.arm, 0, 0, ex, ey);
      this._limb(ctx, art.fore, ex, ey, fx, fy);
      const K = Math.max(8, this.m.shellW * this.m.clawScale) * k;
      const PL = K * 0.46, PR = K * 0.26, FL = K * 0.40;
      const mat = near ? 'hermitRed' : 'hermitDark';
      const cs = Math.cos(a3), sn = Math.sin(a3);
      const px1 = fx + cs * PL, py1 = fy + sn * PL;
      // the palm: big, round-backed and studded
      this._limb(ctx, { r0: PR * 0.7, r1: PR, mat, far: !near, bow: -PR * 0.3, gran: true }, fx, fy, px1, py1);
      const lx = px1 - sn * PR * 0.35, ly = py1 + cs * PR * 0.35;
      this._limb(ctx, { r0: PR * 0.55, r1: Math.max(0.6, PR * 0.15), mat, far: !near, foot: true, gran: true },
        lx, ly, lx + cs * FL, ly + sn * FL);
      const op = -0.2 - this.clawOpen * 0.6;
      const hx = px1 + sn * PR * 0.45, hy = py1 - cs * PR * 0.45;
      const da = a3 + op;
      this._limb(ctx, { r0: PR * 0.48, r1: Math.max(0.6, PR * 0.14), mat, far: !near, foot: true, bow: PR * 0.2, gran: true },
        hx, hy, hx + Math.cos(da) * FL, hy + Math.sin(da) * FL);
      ctx.restore();
    }
    void tm;
  }

  /** Mouthparts, then two small black beads on short stalks. */
  _drawFace(ctx) {
    const rig = this.rig;
    const S = this.S;
    const mo = rig.sockets.mouth;
    if (rig.mouth) {
      ctx.save();
      ctx.translate(mo.x, mo.y + Math.sin(this.mouthT) * 0.4 * S);
      ctx.rotate(Math.sin(this.mouthT * 1.3) * 0.12);
      ctx.drawImage(rig.mouth.cv, -rig.mouth.ox, -rig.mouth.oy);
      ctx.restore();
    }

    const art = rig.eye;
    // two long antennae, banded red and white, sweeping forward and up and
    // never still - feeling the air for water
    {
      const tm = this.game.time || 0;
      const Z = Math.max(0.05, this.game?.cam?.zoom || 1);
      const T = { a: Z, b: 0, c: 0, d: Z, e: 0, f: 0 };
      const E = rig.sockets.eyes;
      ctx.save();
      for (let k = 0; k < 2; k++) {
        const e = E[k];
        const L = this.m.rx * (1.5 + k * 0.2);
        let x = e.x + 1, y = e.y + 1;
        const base = -0.55 - k * 0.3 + Math.sin(tm * 1.3 + k * 2) * 0.12 + this.look.y * 0.1;
        const n = 18;
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const f = i / n;
          const ang = base + f * (0.9 + Math.sin(tm * 2.1 + k + f * 3) * 0.18);
          pts.push({ x, y });
          x += Math.cos(ang) * L / n; y += Math.sin(ang) * L / n;
        }
        ctx.save();
        ctx.scale(1 / Z, 1 / Z);
        const ac = Math.max(1, Math.round(Math.hypot(T.a, T.b) * 0.6));
        let px = null, py = null;
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i];
          const sx = Math.round((T.a * q.x + T.c * q.y + T.e) / ac), sy = Math.round((T.b * q.x + T.d * q.y + T.f) / ac);
          ctx.fillStyle = (i >> 1) & 1 ? '#f0d8c4' : (k ? '#8c2a16' : '#b0391c');
          if (px === null) ctx.fillRect(sx * ac, sy * ac, ac, ac);
          else {
            // join the dots, a pixel at a time
            const n2 = Math.max(Math.abs(sx - px), Math.abs(sy - py), 1);
            for (let j = 1; j <= n2; j++) ctx.fillRect(Math.round(px + (sx - px) * j / n2) * ac, Math.round(py + (sy - py) * j / n2) * ac, ac, ac);
          }
          px = sx; py = sy;
        }
        ctx.restore();
      }
      ctx.restore();
    }
    for (const e of rig.sockets.eyes) {
      // stalks splay out and up, and both lean the way the crab is looking
      // Stalks splay out and up and both lean the way the crab is looking.
      // Each one also has a life of its own: a slow sway out of step with
      // the other, a bob while it walks, and a little springy stretch.
      const tm = this.game.time || 0;
      const walk = clamp01(Math.abs(this.vx) / Math.max(1, this.speed));
      const base = -Math.PI / 2 + e.side * 0.34;
      const a = base + this.look.x * 0.45 + this.look.y * 0.12 * e.side
        + Math.sin(tm * 2.1 + e.side * 1.7) * 0.10
        + Math.sin(tm * 9.0 + e.side) * 0.14 * walk;
      const st = 1 + Math.sin(tm * 3.3 + e.side * 2.2) * 0.07 + walk * Math.abs(Math.sin(tm * 9.0)) * 0.08;
      // `asleep` (0..1) folds the stalks down and shuts the beads for as long
      // as it is held - a blink is a moment, sleep is a thousand years
      const shrink = Math.min(this.blink > 0
        ? 1 - Math.sin(clamp01(this.blink / 0.16) * Math.PI) * 0.7 : 1, 1 - clamp01(this.asleep || 0) * 0.62);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(a);
      ctx.scale(st, shrink);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
      // the eyeball, placed in body space so it does not swing with the
      // stalk: a dark rim, the white, a big pupil that follows the look, and
      // two catchlights - which is most of what makes it a face you like
      // a plain bead of pitch black on the end of each stalk, centred on a
      // whole pixel so it is a clean round dot
      const r = Math.max(1.6, art.r * 0.55);
      const ex = Math.round(e.x + Math.cos(a) * art.globe * st) + 0.5;
      const ey = Math.round(e.y + Math.sin(a) * art.globe * st) + 0.5;
      if (shrink > 0.55) {
        // What you are holding still shows in the animal: the mode's colour
        // burns faintly round the bead, harder while something is happening.
        const tint = this.game.modeTint;
        if (tint) {
          const heat = 0.55 + 0.45 * Math.sin(this.game.time * 3.2);
          ctx.save();
          ctx.globalAlpha = 0.30 + heat * 0.35;
          pxGlow(ctx, ex, ey, r * 2.6, tint.glow, 1, { p: 1, steps: 3 });
          ctx.restore();
        }
        // drawn on the screen's own grid: the body rocks and tilts, and a
        // disc laid out in its tilted space comes out furry
        const Z = Math.max(0.05, this.game?.cam?.zoom || 1);
        const T = { a: Z, b: 0, c: 0, d: Z, e: 0, f: 0 };
        const sx = T.a * ex + T.c * ey + T.e, sy = T.b * ex + T.d * ey + T.f;
        const sr = r * Math.hypot(T.a, T.b);
        ctx.save();
        ctx.scale(1 / Z, 1 / Z);
        const bx = Math.round(sx), by = Math.round(sy);
        // A crab's eye is a compound eye on the end of the stalk: a dark,
        // slightly long bulb, faceted, catching the light in one small wet
        // point and a dull sheen across its top. Drawn on the screen grid.
        const ang = Math.atan2(T.b * Math.cos(a) + T.d * Math.sin(a), T.a * Math.cos(a) + T.c * Math.sin(a));
        const ca = Math.cos(ang), sa2 = Math.sin(ang);
        const cell = Math.max(1, Math.round(Math.hypot(T.a, T.b) * 0.6));
        // small, round and glossy: a thick black outline, a big dark pupil
        // and a fat white catchlight - a bead you want to look back at
        const rr = Math.max(2.2, sr * 0.62 / cell);
        const R = Math.ceil(rr) + 1;
        for (let yy = -R; yy <= R; yy++) {
          for (let xx = -R; xx <= R; xx++) {
            const d = Math.hypot(xx, yy) / rr;
            if (d > 1) continue;
            let c;
            if (d > 1 - 1.1 / rr) c = '#000000';
            else if (yy > 0 && d > 0.45) c = '#3a3418';     // a warm glint in the lower rim
            else c = '#0b0a10';
            ctx.fillStyle = c;
            ctx.fillRect(bx + xx * cell, by + yy * cell, cell, cell);
          }
        }
        const hs = Math.max(1, Math.round(rr * 0.55));
        const hx = Math.round(-rr * 0.45) - Math.floor(hs / 2) + 1, hy = Math.round(-rr * 0.45) - Math.floor(hs / 2) + 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx + hx * cell, by + hy * cell, hs * cell, hs * cell);
        if (rr > 2.2) ctx.fillRect(bx + Math.round(rr * 0.35) * cell, by + Math.round(rr * 0.3) * cell, cell, cell);
        ctx.restore();
      } else {
        // shut: a happy little arc
        ctx.fillStyle = '#000000';
        for (let k = -2; k <= 2; k++) {
          ctx.fillRect(Math.round(ex + k * r * 0.4), Math.round(ey - (2 - Math.abs(k)) * 0.5 * S), 1, 1);
        }
      }
    }

  }

  _drawShadow(ctx, cam) {
    const t = this.game.terrain;
    const sun = this.game.weather ? this.game.weather.shadowAlpha : 0.4;
    if (sun <= 0.02) return;
    const w = this.m.rx * 1.05;
    const steps = 10;
    ctx.save();
    ctx.globalAlpha = sun * 0.55;
    ctx.fillStyle = '#2a1a10';
    for (let i = 0; i < steps; i++) {
      const k = (i + 0.5) / steps;
      const wx = this.x + lerp(-w, w, k);
      const gy = t.surfaceY(wx);
      const s0 = cam.worldToScreen(wx, gy);
      const hgt = Math.sqrt(Math.max(0, 1 - Math.pow((k - 0.5) * 2, 2)));
      const hw = (w * 2 / steps) * cam.zoom * 0.62;
      ctx.fillRect(Math.round(s0.x - hw / 2), Math.round(s0.y - 1 * cam.zoom),
        Math.ceil(hw) + 1, Math.ceil(hgt * 3.4 * cam.zoom) + 1);
    }
    ctx.restore();
  }
}
