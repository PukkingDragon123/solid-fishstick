// CRABDEN - input router. Screen coordinates are kept in "virtual pixels"
// (the low-res render buffer) so gameplay code never sees device pixels.

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
    this._touchZoomDist = 0;
    this._install();
  }

  _install() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      this.sx = (e.clientX - r.left) / this.scale;
      this.sy = (e.clientY - r.top) / this.scale;
    };

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('pointerdown', (e) => {
      pos(e);
      c.setPointerCapture?.(e.pointerId);
      this.anyInput = true;
      this.moved = false;
      this.pressPos = { x: this.sx, y: this.sy };
      if (e.button === 0) this.down = true;
      else if (e.button === 2) this.rightDown = true;
      else if (e.button === 1) { this.midDown = true; e.preventDefault(); }
    });

    window.addEventListener('pointermove', (e) => {
      const px = this.sx, py = this.sy;
      pos(e);
      if (this.down || this.rightDown || this.midDown) {
        this.dragDX += this.sx - px;
        this.dragDY += this.sy - py;
        if (Math.hypot(this.sx - this.pressPos.x, this.sy - this.pressPos.y) > 3) {
          this.moved = true;
          this.dragging = true;
        }
      }
    });

    window.addEventListener('pointerup', (e) => {
      pos(e);
      if (e.button === 0 && this.down) {
        this.down = false;
        if (!this.moved) {
          this.clicked = true;
          const now = performance.now();
          if (now - this._lastClickTime < 300) this.dblClicked = true;
          this._lastClickTime = now;
        }
      }
      if (e.button === 2 && this.rightDown) {
        this.rightDown = false;
        if (!this.moved) this.rightClicked = true;
      }
      if (e.button === 1) this.midDown = false;
      if (!this.down && !this.rightDown && !this.midDown) this.dragging = false;
    });

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
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
      this.released.add(k);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.down = this.rightDown = false; this.dragging = false; });

    // pinch zoom (touch)
    c.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (this._touchZoomDist) {
          const diff = d - this._touchZoomDist;
          if (Math.abs(diff) > 30) { this.wheel += diff > 0 ? -1 : 1; this._touchZoomDist = d; }
        } else this._touchZoomDist = d;
        e.preventDefault();
      }
    }, { passive: false });
    c.addEventListener('touchend', () => { this._touchZoomDist = 0; });
  }

  key(k) { return this.keys.has(k); }
  justPressed(k) { return this.pressed.has(k); }

  /** Axis helper for WASD / arrows. */
  axis() {
    let x = 0, y = 0;
    if (this.key('a') || this.key('ArrowLeft')) x -= 1;
    if (this.key('d') || this.key('ArrowRight')) x += 1;
    if (this.key('w') || this.key('ArrowUp')) y -= 1;
    if (this.key('s') || this.key('ArrowDown')) y += 1;
    const m = Math.hypot(x, y);
    return m > 0 ? { x: x / m, y: y / m, len: 1 } : { x: 0, y: 0, len: 0 };
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
    this.anyInput = false;
  }
}
