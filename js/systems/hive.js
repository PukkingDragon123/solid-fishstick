// CRABDEN - the spore, and everything it is already in.
//
// Two halves of the same idea.
//
// THE THROW is a skill. You hold to charge and the arc goes out further and
// further, and somewhere in the charge is the point where the bladder is at
// pressure and not yet past it. Let go there and the cloud lands where the arc
// says. Let go early and it falls short; hold too long and it bursts on you.
//
// THE WILLINGNESS is the other half, and it is not a skill at all. A spore
// does not take in an animal that is fighting it. It has to be tired, or fed,
// or already half trusting you - and if it is none of those, it throws the
// thing off and remembers that you tried.
//
// THE HIVE is what you have got. Everything carrying your spore is on one
// nerve, and while you are looking down it the world goes strange: cold, slow,
// rimmed, and threaded back to you.

import { clamp, clamp01, damp, lerp, TAU } from '../lib/math.js';
import { pxDisc, pxGlow, pxSize } from '../render/pix.js';

const CHARGE_SECS = 1.35;       // hold this long and the bladder is at pressure
const SWEET = [0.62, 0.88];     // the part of the charge that actually throws
const BURST = 1.25;             // hold past this and it goes off in your face

export class Hive {
  constructor(game) {
    this.game = game;
    this.charge = 0;            // 0..1+, how long the button has been held
    this.holding = false;
    this.flight = null;         // a spore in the air
    this.dream = 0;             // 0..1 how far into the hive view we are
    this.pulse = 0;             // the ring that travels out from you
    this.pick = null;           // which of yours you are driving
    this.t = 0;
    this.refused = 0;           // the last thing that threw one off
  }

  /** Everything on your nerve: puppets first, then the rest of the fleet. */
  roster() {
    const w = this.game.wildlife;
    const out = w.fleet.filter((c) => c.alive);
    if (this.game.mind?.owned) out.unshift(this.game.npc);
    return out;
  }

  // -- the throw ------------------------------------------------------------

  hold(on) {
    if (on && !this.holding) { this.charge = 0; this.holding = true; }
    else if (!on && this.holding) { this.holding = false; return this.release(); }
    return null;
  }

  /** How far the arc reaches at the current charge. */
  get reach() { return lerp(26, 190, clamp01(this.charge / CHARGE_SECS)); }

  get pressured() {
    const k = this.charge / CHARGE_SECS;
    return k >= SWEET[0] && k <= SWEET[1];
  }

  release() {
    const e = this.game.economy;
    const k = this.charge / CHARGE_SECS;
    this.charge = 0;
    if (e.parasites < 1) { this.game.ui.say('No spore.', 2.5); return { ok: false }; }
    const c = this.game.crab;
    const dir = c.facing || 1;
    if (k > BURST) {
      // held too long: it goes off on the animal holding it
      e.parasites--;
      e.markDirty();
      this.game.fx.ring(c.x, c.y - c.m.rx * 0.5, '#c98ade', 20);
      this.game.fx.drift(c.x, c.y - c.m.rx * 0.6, '#c98ade', 8);
      this.game.ui.say('It burst.', 2.5);
      this.game.audio.play('hurt');
      return { ok: false, burst: true };
    }
    e.parasites--;
    e.markDirty();
    const short = k < SWEET[0];
    this.flight = {
      x: c.x + dir * c.m.shellW * 0.42,
      y: c.y - c.m.rx * 0.5,
      vx: dir * this.reach * (short ? 0.55 : 1) * 1.1,
      vy: -80 - this.reach * 0.35,
      t: 0, good: !short,
    };
    this.game.audio.play('jet' in this.game.audio ? 'jet' : 'water', { pitch: 1.4 });
    return { ok: true, good: !short };
  }

  /** Whether a spore that lands on this animal takes. */
  willing(c) {
    if (!c || !c.alive || c.tamed || c.puppet) return false;
    // worn down, fed, or already half trusting: any one will do
    return c.hp < c.hpMax * 0.45 || c.trust > 0.35 || c.mood === 'feed';
  }

  whyNot(c) {
    if (!c) return null;
    if (c.hp < c.hpMax * 0.45) return null;
    if (c.trust > 0.35) return null;
    return 'It threw it off. Wear it down, or feed it first.';
  }

  _land(x, y) {
    const g = this.game;
    g.fx.ring(x, y, '#c98ade', 22);
    for (let i = 0; i < 16; i++) {
      g.fx.drift(x + (Math.random() - 0.5) * 26, y - Math.random() * 12, '#c98ade', 1);
    }
    g.audio.play('water', { pitch: 0.7 });
    const hit = g.wildlife.nearest(x, y, 34, (q) => q.alive && !q.puppet && !q.tamed);
    if (!hit) return;
    if (!this.willing(hit)) {
      this.refused = 1;
      hit.trust = Math.max(0, hit.trust - 0.2);
      hit.mood = 'flee';
      g.fx.popup(hit.x, hit.y - 14, 'no', '#c07a6a');
      g.ui.say(this.whyNot(hit), 4);
      return;
    }
    hit.puppet = true;
    hit.tamed = true;
    hit.trust = 1;
    if (!g.wildlife.fleet.includes(hit)) g.wildlife.fleet.push(hit);
    g.fx.ring(hit.x, hit.y - 10, '#6fd8ee', 18);
    g.fx.popup(hit.x, hit.y - 16, hit.def.name, '#6fd8ee');
    g.audio.play('discover');
    g.economy.markDirty();
  }

  // -- the hive view --------------------------------------------------------

  update(dt, inHive) {
    this.t += dt;
    this.dream = damp(this.dream, inHive ? 1 : 0, 0.0009, dt);
    this.refused = Math.max(0, this.refused - dt);
    if (inHive) {
      this.pulse += dt * 0.55;
      if (this.pulse > 1) this.pulse -= 1;
    }
    if (this.holding) this.charge += dt;

    const f = this.flight;
    if (f) {
      f.t += dt;
      f.vy += 420 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (Math.random() < dt * 40) this.game.fx.drift(f.x, f.y, '#c98ade', 1);
      const gy = this.game.terrain.surfaceY(f.x);
      if (f.y >= gy || f.t > 3) { this._land(f.x, Math.min(f.y, gy)); this.flight = null; }
    }

    // a puppet you have picked walks on your keys
    if (this.pick && (!this.pick.alive || !this.roster().includes(this.pick))) this.pick = null;
  }

  // -- drawing --------------------------------------------------------------

  /** The arc, while you are charging, and the spore while it is in the air. */
  drawAim(ctx, cam) {
    const c = this.game.crab;
    if (this.flight) {
      const s = cam.worldToScreen(this.flight.x, this.flight.y);
      const z = cam.zoom;
      pxGlow(ctx, s.x, s.y, 6 * z, '#d6a0ec', 0.9, { p: pxSize(z), steps: 3 });
      pxDisc(ctx, s.x, s.y, 1.6 * z, '#f4dcff', { p: pxSize(z) });
    }
    if (!this.holding) return;
    const dir = c.facing || 1;
    const k = clamp01(this.charge / CHARGE_SECS);
    const x0 = c.x + dir * c.m.shellW * 0.42, y0 = c.y - c.m.rx * 0.5;
    const vx = dir * this.reach * 1.1, vy = -80 - this.reach * 0.35;
    // the arc, as the dots it would actually pass through
    const good = this.pressured;
    ctx.save();
    for (let i = 1; i <= 16; i++) {
      const t = i * 0.055;
      const px = x0 + vx * t, py = y0 + vy * t + 210 * t * t;
      const gy = this.game.terrain.surfaceY(px);
      if (py > gy) break;
      const s = cam.worldToScreen(px, py);
      ctx.globalAlpha = 0.25 + (good ? 0.55 : 0.2) * (1 - i / 18);
      ctx.fillStyle = good ? '#e8c0ff' : '#8a6e96';
      const r = Math.max(1, Math.round(cam.zoom * (good ? 1.1 : 0.8)));
      ctx.fillRect(Math.round(s.x), Math.round(s.y), r, r);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * The dream. Everything goes cold and slightly wrong, a ring travels out
   * from you along the nerve, and every animal on that nerve is rimmed and
   * strung back to your shell by a thread that breathes.
   */
  drawDream(ctx, cam, vw, vh) {
    const k = this.dream;
    if (k < 0.01) return;
    const c = this.game.crab;
    const s0 = cam.worldToScreen(c.x, c.y - c.m.rx * 0.4);
    const t = this.t;

    // ---- the grade. Everything goes cold and a little bit wrong. ---------
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = k * 0.55;
    const grade = ctx.createLinearGradient(0, 0, 0, vh);
    grade.addColorStop(0, '#5a7ec8');
    grade.addColorStop(0.5, '#3f6ba8');
    grade.addColorStop(1, '#24406e');
    ctx.fillStyle = grade;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = k * 0.22;
    const lift = ctx.createRadialGradient(s0.x, s0.y, 0, s0.x, s0.y, Math.max(vw, vh) * 0.55);
    lift.addColorStop(0, '#7fe2f4');
    lift.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lift;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();

    // ---- the drift. Slow bands of light crossing the frame, out of step
    // with each other, so nothing in the picture sits still. ---------------
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ph = t * (0.12 + i * 0.05) + i * 0.37;
      const y = ((ph % 1) * (vh + 160)) - 80;
      const h = 26 + i * 12;
      ctx.globalAlpha = k * 0.055;
      const g2 = ctx.createLinearGradient(0, y - h, 0, y + h);
      g2.addColorStop(0, 'rgba(120,220,240,0)');
      g2.addColorStop(0.5, 'rgba(150,230,250,0.9)');
      g2.addColorStop(1, 'rgba(120,220,240,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, y - h, vw, h * 2);
    }
    ctx.restore();

    // ---- the pulse going out along the nerve, three of them, staggered ---
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const p = (this.pulse + i / 3) % 1;
      const pr = p * Math.max(vw, vh) * 0.85;
      ctx.globalAlpha = k * (1 - p) * (1 - p) * 0.5;
      ctx.strokeStyle = '#a8f0ff';
      ctx.lineWidth = 1 + (1 - p) * 2.5;
      ctx.beginPath();
      ctx.ellipse(s0.x, s0.y, pr, pr * 0.5, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // ---- everything on the nerve, rimmed and strung back to you ----------
    const list = this.roster();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const q of list) {
      const s = cam.worldToScreen(q.x, q.y - 8);
      const own = q === this.pick;
      const beat = 0.6 + 0.4 * Math.sin(t * 3 + (q.uid || 0));
      // the thread, with a travelling bead on it
      const sway = Math.sin(t * 2.1 + (q.uid || 0) * 1.7) * 16 * k;
      const mx = (s0.x + s.x) / 2, my = (s0.y + s.y) / 2 + sway;
      ctx.globalAlpha = k * (own ? 0.85 : 0.45);
      ctx.strokeStyle = own ? '#ffe9a8' : '#7fd8ea';
      ctx.lineWidth = own ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.quadraticCurveTo(mx, my, s.x, s.y);
      ctx.stroke();
      // a bead of signal running down it
      const bt = (t * 0.8 + (q.uid || 0) * 0.31) % 1;
      const bx = (1 - bt) * (1 - bt) * s0.x + 2 * (1 - bt) * bt * mx + bt * bt * s.x;
      const by = (1 - bt) * (1 - bt) * s0.y + 2 * (1 - bt) * bt * my + bt * bt * s.y;
      ctx.globalAlpha = k * 0.9;
      pxDisc(ctx, bx, by, own ? 2.2 : 1.5, own ? '#fff4d0' : '#bff2ff', { p: 1 });
      // and the halo on the animal itself
      const r = (own ? 16 : 11) * cam.zoom * 0.5 * beat;
      ctx.globalAlpha = k;
      pxGlow(ctx, s.x, s.y, r * 2.2, own ? '#ffe9a8' : '#7fd8ea', own ? 0.55 : 0.42,
        { p: pxSize(cam.zoom), steps: 3 });
    }
    ctx.restore();

    // ---- and the frame closes in, breathing --------------------------------
    const vig = ctx.createRadialGradient(s0.x, s0.y, Math.min(vw, vh) * (0.18 + 0.02 * Math.sin(t * 1.3)),
      s0.x, s0.y, Math.max(vw, vh) * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(6,14,32,${0.52 * k})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }

}
