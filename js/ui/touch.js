// CRABDEN - on-screen controls for touch devices.
//
// These press "virtual keys" on the Input object, so every gameplay path is
// the one the keyboard already uses. Nothing downstream knows the difference
// between a thumb and a keycap.
//
// Layout adapts to the viewport: a wide screen gets a thumb cluster in each
// bottom corner, a narrow (portrait) one lifts the ability row clear of both.

import { TAU, clamp, clamp01, lerp, rgba } from '../lib/math.js';
import { drawText } from '../lib/font.js';
import { pxEllipse } from '../render/sprites.js';

const R = Math.round;

export class TouchControls {
  constructor(game) {
    this.game = game;
    // Show immediately on a device that reports a coarse pointer, then follow
    // whatever the player actually used last.
    this.autoDetected = typeof window !== 'undefined'
      && (window.matchMedia?.('(pointer: coarse)')?.matches || (navigator.maxTouchPoints || 0) > 0);
    this.forced = null;          // set by the settings toggle
    this.controls = [];
    this.stick = { active: false, id: null, cx: 0, cy: 0, r: 30, kx: 0, ky: 0 };
    this.held = new Map();       // pointerId -> control
    this.fade = 0;
    this._vw = 0; this._vh = 0;

    game.input.claimHandler = (p) => this.claim(p);
    game.input.moveHandler = (p) => this.move(p);
    game.input.releaseHandler = (p, cancelled) => this.release(p, cancelled);
  }

  /** Are the on-screen controls live right now? */
  get active() {
    if (this.forced !== null) return this.forced;
    return this.game.input.lastPointerType === 'touch' || this.autoDetected;
  }

  get compact() { return this._vw > 0 && this._vw < 300; }

  toggle() {
    this.forced = this.active ? false : true;
    if (!this.forced) this._releaseAll();
  }

  _releaseAll() {
    for (const c of this.held.values()) if (c.key) this.game.input.setVirtual(c.key, false);
    this.held.clear();
    this.stick.active = false;
    this.stick.id = null;
    this.game.input.virtualAxis = { x: 0, y: 0, len: 0 };
  }

  // -- layout ---------------------------------------------------------------

  layout() {
    const g = this.game;
    const vw = g.renderer.vw, vh = g.renderer.vh;
    const slots = g.evo ? g.evo.slotCount : 2;
    if (vw === this._vw && vh === this._vh && slots === this._slots) return;
    this._vw = vw; this._vh = vh; this._slots = slots;

    const narrow = vw < 300;
    const c = [];
    const add = (o) => { c.push(o); return o; };

    // movement stick, bottom left
    this.stick.r = narrow ? 26 : 30;
    this.stick.cx = this.stick.r + 10;
    this.stick.cy = vh - this.stick.r - 12;

    // right-hand thumb cluster
    add({ id: 'pump', kind: 'hold', key: 'f', label: 'PUMP', cx: vw - 38, cy: vh - 64, r: 21, when: 'play' });
    add({ id: 'pour', kind: 'hold', key: 'q', label: 'POUR', cx: vw - 92, cy: vh - 52, r: 17, when: 'play' });
    add({ id: 'act', kind: 'context', cx: vw - 30, cy: vh - 23, r: 17, when: 'play' });

    // ability row
    const size = 18, gap = 3;
    const n = clamp(slots, 1, 5);
    const rowW = n * size + (n - 1) * gap;
    let ax, ay;
    if (narrow) { ax = Math.round(vw / 2 - rowW / 2); ay = vh - 104; }
    else { ax = Math.round(vw - 62 - rowW); ay = vh - 32; }
    for (let i = 0; i < n; i++) {
      add({
        id: 'ability' + i, kind: 'tap', key: String(i + 1), slot: i, square: true,
        cx: ax + i * (size + gap) + size / 2, cy: ay + size / 2, r: size / 2, when: 'play',
      });
    }

    // system buttons, tucked above the stick where no thumb rests
    const sy = this.stick.cy - this.stick.r - 24;
    add({ id: 'menu', kind: 'tap', key: 'Escape', icon: 'menu', cx: 16, cy: sy, r: 11, when: 'play' });
    add({ id: 'recenter', kind: 'tap', key: 'z', icon: 'target', cx: 42, cy: sy, r: 11, when: 'play' });

    // cutscenes and panels each get one big obvious exit
    add({ id: 'skip', kind: 'tap', key: 'Escape', label: 'SKIP', cx: vw - 30, cy: vh - 23, r: 17, when: 'cutscene' });
    add({ id: 'close', kind: 'tap', key: 'Escape', icon: 'close', cx: vw - 14, cy: 14, r: 11, when: 'panel' });

    this.controls = c;
  }

  _visible(ctrl) {
    const s = this.game.state;
    if (ctrl.when === 'play') return s === 'play' || s === 'dead';
    if (ctrl.when === 'cutscene') return s === 'cutscene';
    if (ctrl.when === 'panel') return s === 'panel';
    return true;
  }

  _stickVisible() {
    return this.game.state === 'play' || this.game.state === 'dead';
  }

  // -- pointer routing ------------------------------------------------------

  claim(p) {
    if (!this.active) return null;
    this.layout();

    // Explicit buttons win over the stick: the stick has a deliberately
    // generous grab area and would otherwise swallow the buttons above it.
    for (const ctrl of this.controls) {
      if (!this._visible(ctrl)) continue;
      const hitR = ctrl.r + 8;
      if (Math.hypot(p.x - ctrl.cx, p.y - ctrl.cy) > hitR) continue;
      this.held.set(p.id, ctrl);
      ctrl.pressT = 1;
      if (ctrl.kind === 'hold') {
        this.game.input.setVirtual(ctrl.key, true);
      } else if (ctrl.kind === 'tap') {
        this.game.input.pulseVirtual(ctrl.key);
        this.game.audio.play('ui');
      } else if (ctrl.kind === 'context') {
        const act = this.game.touchContext();
        if (act) { this.game.input.pulseVirtual(act.key); this.game.audio.play('ui'); }
        else this.game.audio.play('deny');
      }
      return ctrl;
    }

    if (this._stickVisible() && !this.stick.active) {
      const grabR = this.stick.r + 16;
      if (Math.hypot(p.x - this.stick.cx, p.y - this.stick.cy) < grabR) {
        this.stick.active = true;
        this.stickUsed = true;
        this.stick.id = p.id;
        this._stickTo(p.x, p.y);
        return { id: 'stick' };
      }
    }
    return null;
  }

  move(p) {
    if (this.stick.active && this.stick.id === p.id) { this._stickTo(p.x, p.y); return; }
    const ctrl = this.held.get(p.id);
    if (!ctrl) return;
    // sliding well off a held button releases it, like a real on-screen pad
    if (ctrl.kind === 'hold' && Math.hypot(p.x - ctrl.cx, p.y - ctrl.cy) > ctrl.r + 26) {
      this.game.input.setVirtual(ctrl.key, false);
      this.held.delete(p.id);
    }
  }

  release(p) {
    if (this.stick.active && this.stick.id === p.id) {
      this.stick.active = false;
      this.stick.id = null;
      this.stick.kx = 0; this.stick.ky = 0;
      this.game.input.virtualAxis = { x: 0, y: 0, len: 0 };
      return;
    }
    const ctrl = this.held.get(p.id);
    if (!ctrl) return;
    if (ctrl.kind === 'hold') this.game.input.setVirtual(ctrl.key, false);
    this.held.delete(p.id);
  }

  _stickTo(x, y) {
    const s = this.stick;
    let dx = x - s.cx, dy = y - s.cy;
    const d = Math.hypot(dx, dy);
    const max = s.r;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    s.kx = dx; s.ky = dy;
    const len = clamp01(Math.hypot(dx, dy) / (max * 0.82));
    if (len > 0.12) {
      const m = Math.hypot(dx, dy) || 1;
      this.game.input.virtualAxis = { x: dx / m, y: dy / m, len };
      // grabbing the stick means you want to drive
      const crab = this.game.crab;
      if (!crab.controlled) {
        crab.controlled = true;
        crab.moveTarget = null;
        this.game.cam.followEntity(crab);
      }
    } else {
      this.game.input.virtualAxis = { x: 0, y: 0, len: 0 };
    }
  }

  // -- frame ----------------------------------------------------------------

  update(dt) {
    this.layout();
    this.fade = lerp(this.fade, this.active ? 1 : 0, 1 - Math.pow(0.002, dt));
    for (const c of this.controls) if (c.pressT) c.pressT = Math.max(0, c.pressT - dt * 4);
    // a control can be left held if its owning pointer vanished
    if (!this.active && this.held.size) this._releaseAll();
  }

  // -- drawing --------------------------------------------------------------

  draw(ctx, game) {
    if (this.fade < 0.02) return;
    const a = this.fade;

    if (this._stickVisible()) this._drawStick(ctx, a);

    for (const ctrl of this.controls) {
      if (!this._visible(ctrl)) continue;
      const pressed = [...this.held.values()].includes(ctrl) || (ctrl.pressT || 0) > 0;
      if (ctrl.kind === 'context') this._drawContext(ctx, game, ctrl, a, pressed);
      else if (ctrl.slot !== undefined) this._drawAbility(ctx, game, ctrl, a, pressed);
      else this._drawButton(ctx, ctrl, a, pressed);
    }
  }

  _face(ctx, cx, cy, r, alpha, pressed, tint) {
    const fill = pressed ? rgba(tint || '#c9a06a', 0.85) : `rgba(22,16,12,${0.6 * alpha})`;
    const edge = pressed ? '#fff0d0' : rgba(tint || '#c9a06a', 0.8 * alpha);
    pxEllipse(ctx, cx, cy, r + 1, r + 1, edge);
    pxEllipse(ctx, cx, cy, r, r, fill);
    if (!pressed) {
      pxEllipse(ctx, cx, cy, r - 1, r - 1, `rgba(22,16,12,${0.45 * alpha})`);
    }
  }

  _drawButton(ctx, ctrl, alpha, pressed) {
    this._face(ctx, ctrl.cx, ctrl.cy, ctrl.r, alpha, pressed, ctrl.tint);
    const fg = pressed ? '#241810' : rgba('#ffe9c0', 0.95 * alpha);
    if (ctrl.label) {
      drawText(ctx, ctrl.label, ctrl.cx, ctrl.cy - 3, { color: fg, align: 'center', scale: 1 });
    } else if (ctrl.icon === 'menu') {
      ctx.fillStyle = fg;
      for (let i = -1; i <= 1; i++) ctx.fillRect(R(ctrl.cx - 5), R(ctrl.cy + i * 3 - 0.5), 10, 1);
    } else if (ctrl.icon === 'target') {
      ctx.fillStyle = fg;
      ctx.fillRect(R(ctrl.cx - 5), R(ctrl.cy), 4, 1);
      ctx.fillRect(R(ctrl.cx + 2), R(ctrl.cy), 4, 1);
      ctx.fillRect(R(ctrl.cx), R(ctrl.cy - 5), 1, 4);
      ctx.fillRect(R(ctrl.cx), R(ctrl.cy + 2), 1, 4);
      ctx.fillRect(R(ctrl.cx) - 1, R(ctrl.cy) - 1, 3, 3);
    } else if (ctrl.icon === 'close') {
      ctx.fillStyle = fg;
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(R(ctrl.cx + i), R(ctrl.cy + i), 1, 1);
        ctx.fillRect(R(ctrl.cx + i), R(ctrl.cy - i), 1, 1);
      }
    }
  }

  _drawContext(ctx, game, ctrl, alpha, pressed) {
    const act = game.touchContext();
    const tint = act ? act.tint : '#7a6a58';
    this._face(ctx, ctrl.cx, ctrl.cy, ctrl.r, alpha, pressed, tint);
    const fg = pressed ? '#241810'
      : act ? rgba('#ffe9c0', 0.95 * alpha) : rgba('#c8bca8', 0.5 * alpha);
    drawText(ctx, act ? act.label : '--', ctrl.cx, ctrl.cy - 3, { color: fg, align: 'center', scale: 1 });
  }

  _drawAbility(ctx, game, ctrl, alpha, pressed) {
    const evo = game.evo;
    const id = evo.equipped[ctrl.slot];
    const ab = id ? game.abilityById(id) : null;
    const cd = ab ? evo.cooldownFor(id) : 0;
    const ready = ab && cd <= 0;
    const x = ctrl.cx - ctrl.r, y = ctrl.cy - ctrl.r, s = ctrl.r * 2;

    ctx.fillStyle = ready ? rgba('#c9a06a', 0.8 * alpha) : `rgba(120,100,80,${0.55 * alpha})`;
    ctx.fillRect(R(x) - 1, R(y) - 1, R(s) + 2, R(s) + 2);
    ctx.fillStyle = pressed && ready ? rgba('#c9a06a', 0.9) : `rgba(22,16,12,${0.72 * alpha})`;
    ctx.fillRect(R(x), R(y), R(s), R(s));

    if (ab) {
      drawText(ctx, ab.icon, ctrl.cx, ctrl.cy - 5, {
        color: pressed && ready ? '#241810' : ready ? rgba('#ffe0a8', alpha) : rgba('#8a7a66', alpha),
        align: 'center', scale: 1,
      });
      if (cd > 0) {
        ctx.fillStyle = `rgba(10,8,6,${0.62 * alpha})`;
        ctx.fillRect(R(x) + 1, R(y) + 1, R(s) - 2, R((s - 2) * clamp01(cd / (ab.cd || 1))));
      }
      if (ab.cost) {
        drawText(ctx, String(ab.cost), ctrl.cx + ctrl.r - 2, ctrl.cy + ctrl.r - 8, {
          color: rgba('#9fe4f4', alpha), align: 'right', scale: 1,
        });
      }
    } else {
      drawText(ctx, '-', ctrl.cx, ctrl.cy - 4, { color: rgba('#7a6a58', alpha), align: 'center', scale: 1 });
    }
  }

  _drawStick(ctx, alpha) {
    const s = this.stick;
    const live = s.active;
    const a = live ? 1 : alpha;

    // base plate, so the stick reads as a surface to push against rather
    // than another round button
    pxEllipse(ctx, s.cx, s.cy, s.r, s.r, `rgba(18,13,9,${0.34 * a})`);
    ctx.fillStyle = live ? rgba('#ffe9c0', 0.9) : rgba('#c9a06a', 0.6 * a);
    for (let i = 0; i < 32; i++) {
      if (i % 2) continue;
      const ang = (i / 32) * TAU;
      ctx.fillRect(R(s.cx + Math.cos(ang) * s.r), R(s.cy + Math.sin(ang) * s.r), 1, 1);
    }
    // direction ticks at the compass points
    ctx.fillStyle = live ? rgba('#ffe9c0', 0.7) : rgba('#c9a06a', 0.4 * a);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      ctx.fillRect(R(s.cx + dx * (s.r - 4)), R(s.cy + dy * (s.r - 4)), 1, 1);
    }

    // knob: concentric, no crosshair - that shape belongs to the recentre button
    const kx = s.cx + s.kx, ky = s.cy + s.ky;
    pxEllipse(ctx, kx, ky, 12, 12, live ? rgba('#ffe9c0', 0.95) : rgba('#c9a06a', 0.72 * a));
    pxEllipse(ctx, kx, ky, 10, 10, `rgba(26,19,13,${(live ? 0.92 : 0.8) * a})`);
    pxEllipse(ctx, kx, ky, 5, 5, live ? rgba('#ffe9c0', 0.9) : rgba('#e0c890', 0.6 * a));

    // one-time label, above the ring so the screen edge cannot clip it
    if (!this.stickUsed) {
      drawText(ctx, 'MOVE', s.cx, s.cy - s.r - 9, {
        color: rgba('#ffe9c0', 0.6 * a), align: 'center', scale: 1,
      });
    }
  }
}
