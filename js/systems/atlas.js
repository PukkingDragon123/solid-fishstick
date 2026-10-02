// CRABDEN - what has been walked.
//
// The map only charts what you have actually seen. The world is a line along
// X, so "seen" is a set of stretches of that line: every frame the stretch the
// camera can see either side of the crab (and of Vess, who wanders) is marked
// off in cells of CELL world units. The map reads it to lift its fog, and it
// goes into the save as a run-length list so it costs a few bytes.

export const ATLAS_X0 = -26000;
export const ATLAS_X1 = 27000;
const CELL = 100;
const N = Math.ceil((ATLAS_X1 - ATLAS_X0) / CELL);
const SIGHT = 420;            // how far either side you can be said to have seen

export class Atlas {
  constructor(game) {
    this.game = game;
    this.cells = new Uint8Array(N);
    this.version = 0;
    this.t = 0;
  }

  /** Mark what can be seen from x. Returns true if anything new was seen. */
  see(x, r = SIGHT) {
    const a = Math.max(0, Math.floor((x - r - ATLAS_X0) / CELL));
    const b = Math.min(N - 1, Math.floor((x + r - ATLAS_X0) / CELL));
    let fresh = false;
    for (let i = a; i <= b; i++) if (!this.cells[i]) { this.cells[i] = 1; fresh = true; }
    if (fresh) this.version++;
    return fresh;
  }

  /** Called every frame of play; cheap - it only does work a few times a second. */
  track(dt = 1 / 60) {
    const g = this.game;
    if (g.state !== 'play') return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    if (g.crab) this.see(g.crab.x);
    if (g.npc) this.see(g.npc.x, 200);
  }

  /** 1 inside a seen stretch, falling to 0 over `soft` world units outside it. */
  seenAt(x, soft = 600) {
    const i = Math.floor((x - ATLAS_X0) / CELL);
    if (i >= 0 && i < N && this.cells[i]) return 1;
    const k = Math.ceil(soft / CELL);
    let best = Infinity;
    for (let d = 1; d <= k; d++) {
      if ((i - d >= 0 && i - d < N && this.cells[i - d]) || (i + d >= 0 && i + d < N && this.cells[i + d])) { best = d; break; }
    }
    return best === Infinity ? 0 : 1 - (best * CELL) / soft;
  }

  isSeen(x) {
    const i = Math.floor((x - ATLAS_X0) / CELL);
    return i >= 0 && i < N && !!this.cells[i];
  }

  /** The seen stretches, as [[x0, x1], ...] in world units. */
  ranges() {
    const out = [];
    let start = -1;
    for (let i = 0; i <= N; i++) {
      const on = i < N && this.cells[i];
      if (on && start < 0) start = i;
      if (!on && start >= 0) { out.push([ATLAS_X0 + start * CELL, ATLAS_X0 + i * CELL]); start = -1; }
    }
    return out;
  }

  /** How much of the basin has been charted, 0..1. */
  get fraction() {
    let n = 0;
    for (let i = 0; i < N; i++) n += this.cells[i];
    return n / N;
  }

  toJSON() {
    // run lengths of alternating unseen/seen cells, starting with unseen
    const runs = [];
    let cur = 0, len = 0;
    for (let i = 0; i < N; i++) {
      if (this.cells[i] === cur) len++;
      else { runs.push(len); cur = this.cells[i]; len = 1; }
    }
    runs.push(len);
    return { runs };
  }

  fromJSON(d) {
    this.cells.fill(0);
    if (!d || !Array.isArray(d.runs)) return;
    let i = 0, cur = 0;
    for (const len of d.runs) {
      for (let k = 0; k < len && i < N; k++) this.cells[i++] = cur;
      cur ^= 1;
    }
    this.version++;
  }
}
