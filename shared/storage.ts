// localStorage can throw (private mode, blocked storage), so never let that break a game.
// Saved values can also be stale, hand-edited or from another version: loadJSON only parses, and
// each module checks the shape of what it reads before trusting it.
/** Every key the arcade stores starts with this. */
export const STORAGE_PREFIX = 'gh-arcade:';
const PREFIX = STORAGE_PREFIX;

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Saves a value. Returns false (and never throws) when the browser refuses, so a game keeps running. */
export function saveJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    reportSaveFailure();
    return false;
  }
}

let saveFailed = false;
const saveFailureListeners = new Set<() => void>();

function reportSaveFailure(): void {
  if (saveFailed) return;
  saveFailed = true;
  saveFailureListeners.forEach((fn) => fn());
}

/**
 * Calls `fn` once if saving does not work on this page (storage blocked, private mode, quota full):
 * on the first save that fails, or straight away if one already has. No DOM here; the pages decide
 * how to tell the player (see shared/storage-notice.ts).
 */
export function onSaveFailed(fn: () => void): void {
  if (saveFailed) fn();
  else saveFailureListeners.add(fn);
}

/** Tries a throwaway write, so a browser that blocks saved data is noticed before the first real save. */
export function checkStorage(): boolean {
  try {
    const key = `${PREFIX}storage-check`;
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    reportSaveFailure();
    return false;
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

