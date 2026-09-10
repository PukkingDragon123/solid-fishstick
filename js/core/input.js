// CRABDEN - input router. Screen coordinates are kept in "virtual pixels"
// (the low-res render buffer) so gameplay code never sees device pixels.
//
// Three sources feed the same state:
//   - mouse + keyboard
//   - touch, tracked per-pointer so a thumb on the stick and a thumb on a
//     button do not fight over one set of fields
//   - the on-screen controls, which press "virtual keys". Everything
//     downstream reads key()/justPressed()/axis() and never learns which.

const MOVE_SLOP = 4;        // virtual px before a press becomes a drag
const TAP_MS = 400;         // longer than this and a touch is not a tap

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.scale = 1;              // display px per virtual px
    this.sx = 0; this.sy = 0;    // pointer, virtual screen space
    this.wx = 0; this.wy = 0;    // pointer, world space (filled by camera)
    this.down = false;           // left button held
    this.rightDown = false;
    this.midDown = false;
    this.clicked = false;        // left click consumed this frame
    this.rightClicked = false;
    this.dblClicked = false;
    this.wheel = 0;
    this.dragging = false;
    this.dragDX = 0; this.dragDY = 0;
    this.pressPos = { x: 0, y: 0 };
    this.moved = false;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.anyInput = false;
    this._lastClickTime = 0;

    // -- touch ------------------------------------------------------------
    this.pointers = new Map();   // pointerId -> record
    this.lastPointerType = 'mouse';
    this.touchPan = false;       // an unclaimed finger is dragging the world
    this.pinchDist = 0;
    /** Set by the on-screen controls: given a pointer, claim it or not. */
    this.claimHandler = null;
    this.moveHandler = null;
    this.releaseHandler = null;

    // -- virtual keys pressed by the on-screen controls --------------------
    this.virtualHeld = new Set();
    this.virtualPressed = new Set();
    this.virtualAxis = { x: 0, y: 0, len: 0 };

    this._install();
  }

  // -- helpers used by the on-screen controls -------------------------------

  /** Hold or release a virtual key. */
  setVirtual(k, down) {
    if (down) {
      if (!this.virtualHeld.has(k)) this.virtualPressed.add(k);
      this.virtualHeld.add(k);
    } else {
      this.virtualHeld.delete(k);
    }
  }

  /** Fire a virtual key for exactly one frame. */
  pulseVirtual(k) { this.virtualPressed.add(k); }

  clearVirtual() { this.virtualHeld.clear(); this.virtualAxis = { x: 0, y: 0, len: 0 }; }

  /** Synthesise a click at a screen point (used by on-screen buttons). */
  clickAt(sx, sy) { this.sx = sx; this.sy = sy; this.clicked = true; }

  // -- wiring ---------------------------------------------------------------

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / this.scale,
      y: (e.clientY - r.top) / this.scale,
    };
  }

  _touchPointers() {
    const out = [];
    for (const p of this.pointers.values()) if (p.type !== 'mouse' && !p.claimed) out.push(p);
    return out;
  }

  _install() {
    const c = this.canvas;

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      const { x, y } = this._pos(e);
      this.lastPointerType = e.pointerType || 'mouse';
      this.anyInput = true;
      // capture can throw if the pointer is already gone; losing the whole
      // handler to that would drop the press entirely
      try { c.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }

      const p = {
        id: e.pointerId, type: this.lastPointerType,
        x, y, x0: x, y0: y, t0: performance.now(),
        moved: false, claimed: false, control: null, button: e.button,
      };
      this.pointers.set(e.pointerId, p);

      // the on-screen controls get first refusal on every touch
      if (p.type !== 'mouse' && this.claimHandler) {
        const control = this.claimHandler(p);
        if (control) { p.claimed = true; p.control = control; return; }
      }

      if (p.type !== 'mouse') {
        const fingers = this._touchPointers();
        if (fingers.length === 1) {
          // first finger behaves like the left mouse button
          this.sx = x; this.sy = y;
          this.moved = false;
          this.pressPos = { x, y };
          this.down = true;
        } else if (fingers.length === 2) {
          // second finger cancels the tap and starts a pinch
          this.down = false;
          this.moved = true;
          this.pinchDist = Math.hypot(fingers[0].x - fingers[1].x, fingers[0].y - fingers[1].y);
        }
        e.preventDefault();
        return;
      }

      this.sx = x; this.sy = y;
      this.moved = false;
      this.pressPos = { x, y };
      if (e.button === 0) this.down = true;
      else if (e.button === 2) this.rightDown = true;
      else if (e.button === 1) { this.midDown = true; e.preventDefault(); }
    });

    window.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      const { x, y } = this._pos(e);

      if (p) {
        const dx = x - p.x, dy = y - p.y;
        p.x = x; p.y = y;
        if (!p.moved && Math.hypot(x - p.x0, y - p.y0) > MOVE_SLOP) p.moved = true;

        if (p.claimed) {
          if (this.moveHandler) this.moveHandler(p);
          return;
        }

        if (p.type !== 'mouse') {
          const fingers = this._touchPointers();
          if (fingers.length >= 2) {
            // pinch to zoom, and the midpoint drags the camera
            const d = Math.hypot(fingers[0].x - fingers[1].x, fingers[0].y - fingers[1].y);
            if (this.pinchDist) {
              const diff = d - this.pinchDist;
              if (Math.abs(diff) > 22) { this.wheel += diff > 0 ? -1 : 1; this.pinchDist = d; }
            } else this.pinchDist = d;
            this.dragDX += dx / 2;
            this.dragDY += dy / 2;
            this.touchPan = true;
            this.dragging = true;
            this.moved = true;
          } else if (fingers.length === 1) {
            this.sx = x; this.sy = y;
            this.dragDX += dx;
            this.dragDY += dy;
            if (p.moved) {
              this.moved = true;
              this.dragging = true;
              this.touchPan = true;
            }
          }
          return;
        }
      }

      // mouse
      if (this.lastPointerType === 'mouse') {
        const px = this.sx, py = this.sy;
        this.sx = x; this.sy = y;
        if (this.down || this.rightDown || this.midDown) {
          this.dragDX += x - px;
          this.dragDY += y - py;
          if (Math.hypot(x - this.pressPos.x, y - this.pressPos.y) > 3) {
            this.moved = true;
            this.dragging = true;
          }
        }
      }
    });

    const endPointer = (e, cancelled) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (!p) return;

      if (p.claimed) {
        if (this.releaseHandler) this.releaseHandler(p, cancelled);
        return;
      }

      if (p.type !== 'mouse') {
        const held = performance.now() - p.t0;
        const stillDown = this._touchPointers().length > 0;
        if (!stillDown) {
          if (this.down && !p.moved && !cancelled && held < TAP_MS) {
            this.sx = p.x; this.sy = p.y;
            this.clicked = true;
            const now = performance.now();
            if (now - this._lastClickTime < 320) this.dblClicked = true;
            this._lastClickTime = now;
          }
          this.down = false;
          this.dragging = false;
          this.touchPan = false;
          this.pinchDist = 0;
        } else {
          // lifting one of several fingers: do not fire a tap
          this.pinchDist = 0;
          this.moved = true;
        }
        return;
      }

      if (e.button === 0 && this.down) {
        this.down = false;
        if (!this.moved && !cancelled) {
          this.clicked = true;
          const now = performance.now();
          if (now - this._lastClickTime < 300) this.dblClicked = true;
          this._lastClickTime = now;
        }
      }
      if (e.button === 2 && this.rightDown) {
        this.rightDown = false;
        if (!this.moved && !cancelled) this.rightClicked = true;
      }
      if (e.button === 1) this.midDown = false;
      if (!this.down && !this.rightDown && !this.midDown) this.dragging = false;
    };

    window.addEventListener('pointerup', (e) => endPointer(e, false));
    window.addEventListener('pointercancel', (e) => endPointer(e, true));

    window.addEventListener('wheel', (e) => {
      if (e.target === c) e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
      this.anyInput = true;
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      this.anyInput = true;
      this.lastPointerType = 'mouse';
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
      this.released.add(k);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointers.clear();
      this.clearVirtual();
      this.down = this.rightDown = this.midDown = false;
      this.dragging = false;
      this.touchPan = false;
    });

    // stop the page itself from scrolling or bouncing under the canvas
    c.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    c.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  get isTouch() { return this.lastPointerType === 'touch'; }

  key(k) { return this.keys.has(k) || this.virtualHeld.has(k); }
  justPressed(k) { return this.pressed.has(k) || this.virtualPressed.has(k); }

  /**
   * Swallow a press so nothing later in the same frame sees it. Without this
   * one Escape both opens a panel and closes it again.
   */
  consumeKey(k) { this.pressed.delete(k); this.virtualPressed.delete(k); }

  /** Axis helper: WASD / arrows / the on-screen stick. */
  axis() {
    let x = 0, y = 0;
    if (this.keys.has('a') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('w') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('s') || this.keys.has('ArrowDown')) y += 1;
    const m = Math.hypot(x, y);
    if (m > 0) return { x: x / m, y: y / m, len: 1 };
    const v = this.virtualAxis;
    if (v.len > 0.08) return v;
    return { x: 0, y: 0, len: 0 };
  }

  consumeClick() { const c = this.clicked; this.clicked = false; return c; }
  consumeRightClick() { const c = this.rightClicked; this.rightClicked = false; return c; }

  /** Called at end of each frame. */
  endFrame() {
    this.clicked = false;
    this.rightClicked = false;
    this.dblClicked = false;
    this.wheel = 0;
    this.dragDX = 0;
    this.dragDY = 0;
    this.pressed.clear();
    this.released.clear();
    this.virtualPressed.clear();
    this.anyInput = false;
  }
}
