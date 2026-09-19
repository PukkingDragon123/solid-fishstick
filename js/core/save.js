// CRABDEN - localStorage persistence.

const KEY = 'crabden.save.v1';
const SETTINGS_KEY = 'crabden.settings.v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, at: Date.now(), data }));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.data ? parsed.data : null;
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/**
 * Enough about the save to say on the front door what START is about to do.
 * The day and the stage are the two things that make "continue" mean
 * something rather than being a word you press and find out.
 */
export function saveInfo() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const d = p.data || {};
    return {
      at: p.at,
      day: d.day ?? d.weather?.day ?? 0,
      stage: d.stage || 'hatchling',
      planted: d.garden?.plots?.filter?.((q) => q && q.plant)?.length ?? 0,
    };
  } catch { return null; }
}

export function writeSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
