import { isRecord, STORAGE_PREFIX as PREFIX } from './storage';

/**
 * Backup and restore of everything the arcade saves on this device (settings, trophies, stats,
 * best scores), plus a high-score reset. No Phaser and no DOM here; the hub's settings dialog
 * drives it.
 */

const APP = 'gh-arcade';
const BACKUP_VERSION = 1;
const HIGH_SCORE = /^[a-z0-9]+(-[a-z0-9]+)*:highscore$/;

export interface Backup {
  app: typeof APP;
  version: number;
  exportedAt: string;
  /** Saved values by key, without the storage prefix. */
  data: Record<string, unknown>;
}

/** Every arcade key currently in storage, without the prefix. */
function savedKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key.slice(PREFIX.length));
  }
  return keys.sort();
}

/** Collects everything saved on this device into one object that can be written to a file. */
export function exportBackup(): Backup {
  const data: Record<string, unknown> = {};
  try {
    for (const key of savedKeys()) {
      try {
        data[key] = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null');
      } catch {
        /* skip a value that is not valid JSON; it could not be loaded anyway */
      }
    }
  } catch {
    /* storage unavailable: export what there is, which is nothing */
  }
  return { app: APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Why a value is not acceptable for its key, or null if it is fine. */
function problemWith(key: string, value: unknown): string | null {
  if (HIGH_SCORE.test(key)) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? null : `"${key}" is not a score`;
  }
  // Settings and trophies are checked field by field when they are loaded; here they only need the right shape.
  if (key === 'settings' || key === 'trophies') return isRecord(value) ? null : `"${key}" is not an object`;
  if (key === 'hub:sort') return typeof value === 'string' ? null : `"${key}" is not text`;
  if (key === 'hub:ios-install-hint') return typeof value === 'boolean' ? null : `"${key}" is not true or false`;
  return `"${key}" is not something the arcade saves`;
}

export type ImportResult = { ok: true; keys: number } | { ok: false; reason: string };

/**
 * Replaces everything saved on this device with the contents of a backup. The whole backup is
 * checked first, so a file that is rejected changes nothing. Reload the page after a successful
 * import so the modules that keep a copy in memory read the new values.
 */
export function importBackup(raw: unknown): ImportResult {
  if (!isRecord(raw) || raw.app !== APP || !isRecord(raw.data)) return { ok: false, reason: 'This is not a GH Arcade backup file.' };
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    return { ok: false, reason: 'This backup was made by a newer version of the arcade.' };
  }
  const entries = Object.entries(raw.data);
  for (const [key, value] of entries) {
    const problem = problemWith(key, value);
    if (problem) return { ok: false, reason: `The backup could not be used: ${problem}.` };
  }
  try {
    for (const key of savedKeys()) localStorage.removeItem(PREFIX + key);
    for (const [key, value] of entries) localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    return { ok: false, reason: 'This browser is blocking saved data, so the backup could not be restored.' };
  }
  return { ok: true, keys: entries.length };
}

/** Clears every game's best score. Returns how many were removed. */
export function resetHighScores(): number {
  try {
    const scores = savedKeys().filter((key) => HIGH_SCORE.test(key));
    for (const key of scores) localStorage.removeItem(PREFIX + key);
    return scores.length;
  } catch {
    return 0;
  }
}
