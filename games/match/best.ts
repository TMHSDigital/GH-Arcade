import { isRecord, loadJSON, savedNumber, saveJSON } from '../../shared/storage';

/**
 * Best score per mode. The arcade keeps one best score per game (shown on the hub and the game-over
 * screen); Timed and Moves play so differently that each also keeps its own here. No Phaser here.
 */

export type Mode = 'timed' | 'moves';
export const MODES: readonly Mode[] = ['timed', 'moves'];

export type ModeBests = Record<Mode, number>;

/** Listed in trophies.ts as a BEST_KEY, so the hub's "reset best scores" clears it. */
export const MODE_BEST_KEY = 'match:mode-best';
const KEY = MODE_BEST_KEY;

/** Reads a saved value, keeping only well-formed scores, so stale or hand-edited data cannot throw. */
export function parseBests(raw: unknown): ModeBests {
  const data = isRecord(raw) ? raw : {};
  return { timed: savedNumber(data.timed), moves: savedNumber(data.moves) };
}

/** The bests after a run in `mode` scored `score`, and whether that run set a new one. */
export function withScore(bests: ModeBests, mode: Mode, score: number): { bests: ModeBests; isBest: boolean } {
  const isBest = score > bests[mode];
  return { bests: isBest ? { ...bests, [mode]: score } : bests, isBest };
}

export function loadBests(): ModeBests {
  return parseBests(loadJSON<unknown>(KEY, {}));
}

/** Saves the run's score if it beats the mode's best. Returns true for a new best. */
export function recordModeScore(mode: Mode, score: number): boolean {
  const { bests, isBest } = withScore(loadBests(), mode, score);
  if (isBest) saveJSON(KEY, bests);
  return isBest;
}
