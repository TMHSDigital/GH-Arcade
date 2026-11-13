// localStorage can throw (private mode, blocked storage), so never let that break a game.
// Saved values can also be stale, hand-edited or from another version: loadJSON only parses, and
// each module checks the shape of what it reads before trusting it.
const PREFIX = 'gh-arcade:';

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable; ignore */
  }
}

/**
 * Calls `fn` when the saved value for `key` may have changed behind this page's back: another tab
 * wrote or cleared it, or the page was restored from the back/forward cache. Modules that keep an
 * in-memory copy use this to re-read it, so a later whole-object save never erases newer data.
 */
export function onExternalChange(key: string, fn: () => void): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === PREFIX + key) fn();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) fn();
  });
}

/** True for plain objects, the only shape saved sections are allowed to have. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite, non-negative number, or 0 for anything else found in saved data. */
export function savedNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function getHighScore(game: string): number {
  return savedNumber(loadJSON<unknown>(`${game}:highscore`, 0));
}

/** Saves the score if it beats the stored best. Returns true when a new record was set. */
export function submitHighScore(game: string, score: number): boolean {
  if (score <= getHighScore(game)) return false;
  saveJSON(`${game}:highscore`, score);
  return true;
}
