import { isRecord, savedNumber } from './storage';

/**
 * Readers for the shapes inside the trophies save, shared by the module that owns the save
 * (achievements.ts) and the one that merges two of them (backup.ts), so both agree on what a valid
 * entry is. No Phaser here, and nothing is read from storage.
 */

/** How many of its highest scores each game keeps. */
export const TOP_SIZE = 5;

export interface TopScore {
  score: number;
  /** When the run finished (ms since epoch); 0 for a best score from before the table existed. */
  at: number;
}

/** The numeric entries of a saved map (unlock times, counters); anything else in it is dropped. */
export function numberMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isRecord(raw)) for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

/**
 * A game's score table from whatever was saved: only real scores, each run once, best first, at
 * most TOP_SIZE. Equal scores keep the earlier run first. Pass the entries of several saves
 * together to combine their tables.
 */
export function normaliseTop(entries: unknown): TopScore[] {
  if (!Array.isArray(entries)) return [];
  const seen = new Set<string>();
  return entries
    .filter(isRecord)
    .map((e) => ({ score: savedNumber(e.score), at: savedNumber(e.at) }))
    // The same run can be listed twice (a backup made on this device earlier, merged back in).
    .filter((e) => e.score > 0 && !seen.has(`${e.score}@${e.at}`) && seen.add(`${e.score}@${e.at}`))
    .sort((x, y) => y.score - x.score || x.at - y.at)
    .slice(0, TOP_SIZE);
}
