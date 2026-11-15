import { BEST_TIMES_KEY, type Difficulty, type DifficultyId, DIFFICULTY_ORDER } from './config';
import { isRecord, loadJSON, saveJSON } from '../../shared/storage';

/**
 * Neon Mines scores and best times. The arcade keeps one best score per game (higher is better), so
 * a cleared board scores its difficulty's base plus a bonus for speed; the best time for each
 * difficulty is kept beside it. No Phaser here.
 */

/** Score for a cleared board after `seconds`. */
export function winScore(d: Difficulty, seconds: number): number {
  return d.base + Math.max(0, d.par - Math.floor(seconds)) * d.perSecond;
}

/** Score for a lost board with `cleared` safe cells uncovered. */
export function lossScore(d: Difficulty, cleared: number): number {
  return Math.max(0, cleared) * d.perCell;
}

/** The best clear time for each difficulty, in whole seconds. */
export type BestTimes = Partial<Record<DifficultyId, number>>;

/** Best times from saved data, dropping anything that is not a time for a known difficulty. */
export function parseBestTimes(raw: unknown): BestTimes {
  const out: BestTimes = {};
  if (!isRecord(raw)) return out;
  for (const id of DIFFICULTY_ORDER) {
    const t = raw[id];
    if (typeof t === 'number' && Number.isFinite(t) && t >= 0) out[id] = Math.floor(t);
  }
  return out;
}

/** The times with a new clear added: `isBest` when it beat (or set) the difficulty's best. */
export function withTime(times: BestTimes, id: DifficultyId, seconds: number): { times: BestTimes; isBest: boolean } {
  const s = Math.max(0, Math.floor(seconds));
  const old = times[id];
  if (old !== undefined && old <= s) return { times, isBest: false };
  return { times: { ...times, [id]: s }, isBest: true };
}

/** Seconds as m:ss, e.g. 83 is "1:23". */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function loadBestTimes(): BestTimes {
  return parseBestTimes(loadJSON<unknown>(BEST_TIMES_KEY, {}));
}

/** Records a clear and returns true if it is a new best time for that difficulty. */
export function saveClearTime(id: DifficultyId, seconds: number): boolean {
  const { times, isBest } = withTime(loadBestTimes(), id, seconds);
  if (isBest) saveJSON(BEST_TIMES_KEY, times);
  return isBest;
}
