// CRABDEN - bootstrap.

import { Game } from './game.js';

const canvas = document.getElementById('game');
const boot = document.getElementById('boot');

let game;
try {
  game = new Game(canvas);
  window.CRABDEN = game;
} catch (err) {
  showError(err);
  throw err;
}

if (boot) boot.remove();

// Audio contexts need a real gesture; catch the first one wherever it lands.
const kick = () => {
  game.audio.resume();
  window.removeEventListener('pointerdown', kick);
  window.removeEventListener('keydown', kick);
};
window.addEventListener('pointerdown', kick);
window.addEventListener('keydown', kick);

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  // a tab that has been in the background should not simulate an hour at once
  if (dt > 0.25) dt = 0.25;
  if (dt <= 0) return;

  try {
    game.update(dt);
    game.draw();
  } catch (err) {
    showError(err);
    throw err;
  }
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  last = performance.now();
});

function showError(err) {
  const box = document.createElement('div');
  box.className = 'crash';
  box.innerHTML = `<h1>the crab has encountered a problem</h1><pre></pre>
    <p>reload to try again. if it keeps happening, clear the save from the browser console:
    <code>localStorage.clear()</code></p>`;
  box.querySelector('pre').textContent = (err && err.stack) || String(err);
  document.body.appendChild(box);
}
