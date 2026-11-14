import { isRecord, STORAGE_PREFIX as PREFIX } from './storage';

/**
 * Backup and restore of everything the arcade saves on this device (settings, trophies, stats,
 * best scores). A backup can replace what is here (importBackup) or be combined with it
 * (mergeBackup), for players who have progress on two devices. No Phaser and no DOM here; the
 * hub's settings dialog drives it.
 */

const APP = 'gh-arcade';
const BACKUP_VERSION = 1;
const HIGH_SCORE = /^[a-z0-9]+(-[a-z0-9]+)*:highscore$/;
/** A daily challenge best, e.g. "stack:daily:2026-11-12" (shared/rng.ts). */
const DAILY_SCORE = /^[a-z0-9]+(-[a-z0-9]+)*:daily:\d{4}-\d{2}-\d{2}$/;

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
  // Best scores were once saved per game under "<slug>:highscore". Backups from then still restore;
  // the stats module folds those keys into the trophies save on the next load.
  if (HIGH_SCORE.test(key) || DAILY_SCORE.test(key)) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? null : `"${key}" is not a score`;
  }
  // Settings and trophies are checked field by field when they are loaded; here they only need the right shape.
  if (key === 'settings' || key === 'trophies') return isRecord(value) ? null : `"${key}" is not an object`;
  if (key === 'hub:sort') return typeof value === 'string' ? null : `"${key}" is not text`;
  // The hub's tag filter: a tag, or null for "All".
  if (key === 'hub:tag') return typeof value === 'string' || value === null ? null : `"${key}" is not a tag`;
  if (key === 'hub:ios-install-hint') return typeof value === 'boolean' ? null : `"${key}" is not true or false`;
  return `"${key}" is not something the arcade saves`;
}

export type ImportResult = { ok: true; keys: number } | { ok: false; reason: string };

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
 * checked first, so a file that is rejected changes nothing. Reload the page after a successful
 * import so the modules that keep a copy in memory read the new values.
 */
export function importBackup(raw: unknown): ImportResult {
  const checked = check(raw);
  if (!checked.ok) return checked;
  const { entries } = checked;
  try {
    for (const key of savedKeys()) localStorage.removeItem(PREFIX + key);
    for (const [key, value] of entries) localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    return { ok: false, reason: 'This browser is blocking saved data, so the backup could not be restored.' };
  }
  return { ok: true, keys: entries.length };
}

/** A finite, non-negative number, or 0 for anything else. */
const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** The numeric entries of a saved map (unlock times, counters). */
function numbers(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isRecord(raw)) for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

/** Every key of two saved sections, each once. */
const keysOf = (a: unknown, b: unknown): string[] => [...new Set([...Object.keys(isRecord(a) ? a : {}), ...Object.keys(isRecord(b) ? b : {})])];

/** How many scores a game's table keeps; matches TOP_SIZE in shared/achievements.ts. */
const TOP_SIZE = 5;

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
    const stats: Record<string, number> = {
      plays: Math.max(count(ga.plays), count(gb.plays)),
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
    const seen = new Set<string>();
    const entries = lists
      .flatMap((list) => (Array.isArray(list) ? list : []))
      .filter(isRecord)
      .map((e) => ({ score: count(e.score), at: count(e.at) }))
      // The same run can be in both saves (a backup made on this device earlier); list it once.
      .filter((e) => e.score > 0 && !seen.has(`${e.score}@${e.at}`) && seen.add(`${e.score}@${e.at}`))
      .sort((x, y) => y.score - x.score || x.at - y.at)
      .slice(0, TOP_SIZE);
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
  try {
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
    return { ok: false, reason: 'This browser is blocking saved data, so the backup could not be merged.' };
  }
  return { ok: true, keys: written };
}
