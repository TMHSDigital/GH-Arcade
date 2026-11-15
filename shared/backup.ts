import { normaliseTop, numberMap } from './saved-shapes';
import { DEVICE_KEYS, isRecord, savedNumber, STORAGE_PREFIX as PREFIX } from './storage';

/**
 * Backup and restore of everything the arcade saves on this device (settings, trophies, stats,
 * best scores). A backup can replace what is here (importBackup) or be combined with it
 * (mergeBackup), for players who have progress on two devices. No Phaser and no DOM here; the
 * hub's settings dialog drives it.
 */

const APP = 'gh-arcade';
const BACKUP_VERSION = 1;
const HIGH_SCORE = /^[a-z0-9]+(-[a-z0-9]+)*:highscore$/;
/** A daily challenge best from an older save, e.g. "stack:daily:2026-11-12"; shared/rng.ts folds these into the record below. */
const DAILY_SCORE = /^[a-z0-9]+(-[a-z0-9]+)*:daily:\d{4}-\d{2}-\d{2}$/;
/** A game's daily challenge bests by day, e.g. "stack:daily" (shared/rng.ts). */
const DAILY_RECORD = /^[a-z0-9]+(-[a-z0-9]+)*:daily$/;

export interface Backup {
  app: typeof APP;
  version: number;
  exportedAt: string;
  /** Saved values by key, without the storage prefix. */
  data: Record<string, unknown>;
}

/** Every arcade key currently in storage that holds the player's data, without the prefix. */
function savedKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key.slice(PREFIX.length));
  }
  // What this browser was asked or told stays with the browser: it is not exported, and a restore keeps it.
  return keys.filter((key) => !DEVICE_KEYS.includes(key)).sort();
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
  // Best scores were once saved per game under "<slug>:highscore". Backups from then still restore;
  // the stats module folds those keys into the trophies save on the next load.
  if (HIGH_SCORE.test(key) || DAILY_SCORE.test(key)) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? null : `"${key}" is not a score`;
  }
  // Settings, trophies and daily results are checked field by field when they are loaded; here they only need the right shape.
  if (key === 'settings' || key === 'trophies' || DAILY_RECORD.test(key)) return isRecord(value) ? null : `"${key}" is not an object`;
  if (key === 'hub:sort') return typeof value === 'string' ? null : `"${key}" is not text`;
  // The hub's tag filter: a tag, or null for "All".
  if (key === 'hub:tag') return typeof value === 'string' || value === null ? null : `"${key}" is not a tag`;
  if (key === 'hub:ios-install-hint') return typeof value === 'boolean' ? null : `"${key}" is not true or false`;
  return `"${key}" is not something the arcade saves`;
}

/** A failed import leaves saved data as it was, unless `changed` says the writes could not be undone. */
export type ImportResult = { ok: true; keys: number } | { ok: false; reason: string; changed?: true };

/** Every saved value as stored, so writes that fail part way can be undone. */
function snapshot(): [string, string][] {
  return savedKeys().map((key) => [key, localStorage.getItem(PREFIX + key) ?? 'null']);
}

/** Puts a snapshot back. Returns false if that fails too. */
function rollBack(before: [string, string][]): boolean {
  try {
    for (const key of savedKeys()) localStorage.removeItem(PREFIX + key);
    for (const [key, text] of before) localStorage.setItem(PREFIX + key, text);
    return true;
  } catch {
    return false;
  }
}

/** The result of a write that failed after `before` was taken: rolled back if possible, and honest if not. */
function failed(before: [string, string][] | null, verb: string): ImportResult {
  if (!before || rollBack(before)) return { ok: false, reason: `This browser is blocking saved data, or is out of room for it, so the backup could not be ${verb}.` };
  return {
    ok: false,
    changed: true,
    reason: `The backup could not be ${verb}, and what was saved on this device could not all be put back. Some trophies, scores or settings may be missing.`,
  };
}

/** Checks a whole backup file before anything is written. Returns its entries, or why it cannot be used. */
function check(raw: unknown): { ok: true; entries: [string, unknown][] } | { ok: false; reason: string } {
  if (!isRecord(raw) || raw.app !== APP || !isRecord(raw.data)) return { ok: false, reason: 'This is not a GH Arcade backup file.' };
  if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION) {
    return { ok: false, reason: 'This backup was made by a newer version of the arcade.' };
  }
  const entries = Object.entries(raw.data);
  for (const [key, value] of entries) {
    const problem = problemWith(key, value);
    if (problem) return { ok: false, reason: `The backup could not be used: ${problem}.` };
  }
  return { ok: true, entries };
}

/**
 * Replaces everything saved on this device with the contents of a backup. The whole backup is
 * checked first, so a file that is rejected changes nothing, and a write that fails part way (a
 * full or blocked storage) is undone. Reload the page after a successful import so the modules that
 * keep a copy in memory read the new values.
 */
export function importBackup(raw: unknown): ImportResult {
  const checked = check(raw);
  if (!checked.ok) return checked;
  const { entries } = checked;
  let before: [string, string][] | null = null;
  try {
    before = snapshot();
    for (const [key] of before) localStorage.removeItem(PREFIX + key);
    for (const [key, value] of entries) localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    return failed(before, 'restored');
  }
  return { ok: true, keys: entries.length };
}

// The readers shared with the trophies module, under the short names the merge rules below use.
const count = savedNumber;
const numbers = numberMap;

/** Every key of two saved sections, each once. */
const keysOf = (a: unknown, b: unknown): string[] => [...new Set([...Object.keys(isRecord(a) ? a : {}), ...Object.keys(isRecord(b) ? b : {})])];

/**
 * Combines two trophies saves (see Save in shared/achievements.ts) so that nothing is lost and
 * merging the same backup again changes nothing:
 *
 * - a trophy unlocked on either side stays unlocked, with the earlier date;
 * - best scores and last-played times take the higher value, and the score tables are combined;
 * - plays, totals and counters also take the higher value. Adding them would be closer to the
 *   truth for two separate histories, but would count everything twice if a backup were merged twice.
 */
function mergeTrophies(here: unknown, there: unknown): Record<string, unknown> {
  const a = isRecord(here) ? here : {};
  const b = isRecord(there) ? there : {};

  const unlockedA = numbers(a.unlocked);
  const unlockedB = numbers(b.unlocked);
  const unlocked: Record<string, number> = { ...unlockedB, ...unlockedA };
  for (const id of Object.keys(unlocked)) if (id in unlockedA && id in unlockedB) unlocked[id] = Math.min(unlockedA[id], unlockedB[id]);

  const countersA = numbers(a.counters);
  const countersB = numbers(b.counters);
  const counters: Record<string, number> = {};
  for (const name of keysOf(countersA, countersB)) counters[name] = Math.max(countersA[name] ?? 0, countersB[name] ?? 0);

  const games: Record<string, unknown> = {};
  for (const slug of keysOf(a.games, b.games)) {
    const ga = isRecord(a.games) && isRecord(a.games[slug]) ? a.games[slug] : {};
    const gb = isRecord(b.games) && isRecord(b.games[slug]) ? b.games[slug] : {};
    // A save from before scored plays were counted apart has none: all of its plays count as scored.
    const scored = (g: Record<string, unknown>) => count(g.scoredPlays === undefined ? g.plays : g.scoredPlays);
    const stats: Record<string, number> = {
      plays: Math.max(count(ga.plays), count(gb.plays)),
      scoredPlays: Math.max(scored(ga), scored(gb)),
      best: Math.max(count(ga.best), count(gb.best)),
      totalScore: Math.max(count(ga.totalScore), count(gb.totalScore)),
    };
    const lastPlayed = Math.max(count(ga.lastPlayed), count(gb.lastPlayed));
    if (lastPlayed) stats.lastPlayed = lastPlayed;
    games[slug] = stats;
  }

  const top: Record<string, { score: number; at: number }[]> = {};
  for (const slug of keysOf(a.top, b.top)) {
    const lists = [isRecord(a.top) ? a.top[slug] : [], isRecord(b.top) ? b.top[slug] : []];
    // The same run can be in both saves (a backup made on this device earlier); normaliseTop lists it once.
    const entries = normaliseTop(lists.flatMap((list) => (Array.isArray(list) ? list : [])));
    if (entries.length) top[slug] = entries;
  }

  return { version: Math.max(count(a.version), count(b.version)) || 1, unlocked, counters, games, top };
}

/**
 * Adds the progress in a backup to what is saved on this device, instead of replacing it: trophies
 * and scores from both are kept (see mergeTrophies), per-day and older per-game best scores take
 * the higher value, and settings and hub preferences stay as they are here unless this device has
 * none. The whole backup is checked first, so a file that is rejected changes nothing. Reload the
 * page after a successful merge.
 */
export function mergeBackup(raw: unknown): ImportResult {
  const checked = check(raw);
  if (!checked.ok) return checked;
  let written = 0;
  let before: [string, string][] | null = null;
  try {
    before = snapshot();
    for (const [key, value] of checked.entries) {
      const stored = localStorage.getItem(PREFIX + key);
      let here: unknown = null;
      try {
        here = stored === null ? null : JSON.parse(stored);
      } catch {
        /* unreadable on this device: treat it as missing */
      }
      let merged: unknown;
      if (key === 'trophies') merged = mergeTrophies(here, value);
      else if (DAILY_RECORD.test(key)) {
        // Daily results by day: the higher score for each day either side has played.
        const a = numbers(here);
        const b = numbers(value);
        merged = Object.fromEntries(keysOf(a, b).sort().map((day) => [day, Math.max(count(a[day]), count(b[day]))]));
      }
      else if (HIGH_SCORE.test(key) || DAILY_SCORE.test(key)) merged = Math.max(count(here), count(value));
      // Settings and hub preferences belong to the device: only fill them in where there are none.
      else if (stored === null) merged = value;
      else continue;
      const text = JSON.stringify(merged);
      if (text === stored) continue;
      localStorage.setItem(PREFIX + key, text);
      written++;
    }
  } catch {
    return failed(before, 'merged');
  }
  return { ok: true, keys: written };
}
