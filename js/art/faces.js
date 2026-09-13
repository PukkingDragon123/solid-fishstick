// CRABDEN - his face, decoded.
//
// facedata.js is his portrait sheet on the game's own grid: twenty-one
// expressions, one shared ramp, one character per pixel. This turns a named
// expression into a canvas you can blit, baked once per (name, scale) and
// kept - so a conversation that changes his face every line is not repainting
// four thousand pixels a frame.
//
// Nothing here interpolates or smooths. A portrait is scaled by whole numbers
// only, because half a pixel of his hat brim is not a thing that exists.

import { FACE_W, FACE_H, FACE_PAL, FACE_FRAMES, FACE_NAMES, FACE_ALPHA } from './facedata.js';
import { mixHex } from '../lib/math.js';

export { FACE_W, FACE_H, FACE_NAMES };

const cache = new Map();

// the encoder's alphabet, turned round once so decoding is a lookup and not
// a search through sixty-two characters for every pixel
const INDEX = new Int8Array(128).fill(-1);
for (let i = 0; i < FACE_ALPHA.length; i++) INDEX[FACE_ALPHA.charCodeAt(i)] = i;

/** Is that a face he has? */
export function hasFace(name) { return !!FACE_FRAMES[name]; }

/**
 * One expression as a canvas, `scale` whole pixels across.
 *
 * `spore` washes the ramp toward the violet the takeover puts in everything,
 * so the same twenty-one faces work for a man who is not driving any more.
 */
export function faceCanvas(name, scale = 1, opts = {}) {
  const frame = FACE_FRAMES[name] || FACE_FRAMES.flat;
  const s = Math.max(1, Math.round(scale));
  const spore = Math.max(0, Math.min(1, opts.spore || 0));
  const key = `${name}:${s}:${spore.toFixed(2)}`;
  let cv = cache.get(key);
  if (cv) return cv;

  const pal = spore > 0.01
    ? FACE_PAL.map((c) => mixHex(c, '#a26cd0', spore * 0.55))
    : FACE_PAL;

  cv = document.createElement('canvas');
  cv.width = FACE_W * s;
  cv.height = FACE_H * s;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < FACE_H; y++) {
    for (let x = 0; x < FACE_W; x++) {
      const i = INDEX[frame.charCodeAt(y * FACE_W + x)];
      if (i <= 0) continue;
      g.fillStyle = pal[i - 1];
      g.fillRect(x * s, y * s, s, s);
    }
  }
  // a conversation can only hold so many of these before it is just memory
  if (cache.size > 96) cache.clear();
  cache.set(key, cv);
  return cv;
}

/**
 * Where his face is inside the frame. Everything that wants a close-up -
 * a speech bubble the width of two words, a card on the talk screen - wants
 * the head and not the shoulders, so this is the point to centre on.
 */
export const FACE_EYE = { x: 27, y: 21 };

/**
 * A portrait object in the shape the rest of the game already passes around:
 * a canvas and the point in it that should land where you put it.
 */
export function facePortrait(mood, scale = 1, spore = 0) {
  const s = Math.max(1, Math.round(scale));
  const cv = faceCanvas(faceFor(mood), s, { spore });
  return { cv, ox: FACE_EYE.x * s, oy: FACE_EYE.y * s, W: cv.width, H: cv.height };
}

/**
 * What his face does, by name, for anything that only knows a mood. Anything
 * asking for a mood that is not on the sheet gets the flat one, which is the
 * one he wears most of the time anyway.
 */
export const FACE_FOR = {
  idle: 'flat', flat: 'flat', talk: 'talk', speak: 'talk',
  happy: 'grin', pleased: 'grin', laugh: 'laugh', joy: 'joy',
  drink: 'drink', smug: 'smug', sly: 'smug',
  think: 'squint', squint: 'squint', doubt: 'frown', frown: 'frown',
  cross: 'glare', angry: 'glare', shout: 'shout', yell: 'shout',
  shut: 'shut', peer: 'peer', surprise: 'gasp', startle: 'gasp',
  blank: 'blank', scowl: 'scowl', dull: 'dull', sad: 'sad',
  tired: 'tired', sleep: 'sleep', asleep: 'sleep', spore: 'spore',
  owned: 'spore',
};

/** Resolve a mood to a frame name. */
export function faceFor(mood) {
  return FACE_FOR[mood] || (hasFace(mood) ? mood : 'flat');
}
