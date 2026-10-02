// CRABDEN - his face, by name.
//
// The close-up of Dr. Vess is painted by code now (vessface.js): a lit relief
// of a face, locks of hair, the hat, the glasses, and features placed pixel by
// pixel - twenty-one expressions of it, every one baked once and kept. This
// file is the old front door, so everything that asks for "his face, looking
// like this" keeps working, and anything that hands over a FaceLife gets him
// blinking, glancing and breathing as well.

import { FACE_W, FACE_H, FACE_EYE, FACE_NAMES, hasFace, vessFace, FaceLife } from './vessface.js';

export { FACE_W, FACE_H, FACE_EYE, FACE_NAMES, hasFace, FaceLife };

/** One expression as a still canvas, `scale` whole pixels across. */
export function faceCanvas(name, scale = 1, opts = {}) {
  return vessFace(faceFor(name), scale, { spore: (opts.spore || 0) > 0.5, slot: 'still:' + name }).cv;
}

/**
 * A portrait object in the shape the rest of the game already passes around:
 * a canvas and the point in it that should land where you put it. Pass
 * `anim = { life, talking }` for the living version.
 */
export function facePortrait(mood, scale = 1, spore = 0, anim = null) {
  return vessFace(faceFor(mood), scale, {
    spore: spore > 0.5, life: anim?.life || null, talking: !!anim?.talking,
    slot: anim?.slot || (anim ? 'live' : 'still:' + mood),
  });
}

/**
 * What his face does, by name, for anything that only knows a mood. Anything
 * asking for a mood he has no face for gets the flat one, which is the one he
 * wears most of the time anyway.
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
