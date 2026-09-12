// CRABDEN - bootstrap. Build the game, hand it the canvas, and keep a
// fixed-ish timestep running until the tab goes away.

import { Game } from './game.js';

const canvas = document.getElementById('game');
const boot = document.getElementById('boot');

let game;

start();

function start() {
  try {
    game = new Game(canvas);
    window.CRABDEN = game;
  } catch (err) {
    showError(err);
    throw err;
  }
  if (boot) boot.remove();
  requestAnimationFrame(frame);
}

// audio contexts need a real gesture; catch the first one wherever it lands
const kick = () => {
  game?.audio.resume();
  window.removeEventListener('pointerdown', kick);
  window.removeEventListener('keydown', kick);
};
window.addEventListener('pointerdown', kick);
window.addEventListener('keydown', kick);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (!game) return;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (dt <= 0) return;
  try {
    game.update(dt);
    game.draw();
    game.input.endFrame();
  } catch (err) { showError(err); throw err; }
}
document.addEventListener('visibilitychange', () => { last = performance.now(); });
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    if (!game) return;
    game.renderer.resize();
    game.input.scale = game.renderer.scale;
  }, 120);
});

function showError(err) {
  const box = document.createElement('div');
  box.className = 'crash';
  box.innerHTML = `<h1>the crab has encountered a problem</h1><pre></pre>
    <p>reload to try again. if it keeps happening, clear the save:
    <code>localStorage.clear()</code></p>`;
  box.querySelector('pre').textContent = (err && err.stack) || String(err);
  document.body.appendChild(box);
}
