import { HOLES } from './holes';
import { toPar, totalFromScore } from './scoring';
import { isRecord, loadJSON, savedNumber, saveJSON } from '../../shared/storage';

/**
 * The best round in strokes, kept apart from the arcade's best score. That score counts strokes
 * saved under the cap on every hole, so it only reads back as strokes for a known number of holes:
 * adding a hole would turn every saved best into the wrong total. Here each course length keeps its
 * own best stroke total, so a longer course starts a fresh record and the old one stays right.
 * No Phaser here.
 */

/** Best stroke total by the number of holes in the round, e.g. { "9": 28 }. */
export type BestRounds = Record<string, number>;

/** Listed in trophies.ts as a BEST_KEY and a SAVE_KEY, so it is reset and backed up with the other bests. */
export const BEST_ROUNDS_KEY = 'golf:best-rounds';

/** The course length every best score was set on before this record existed. */
export const LEGACY_HOLES = 9;

const PAR_TOTAL = HOLES.reduce((sum, h) => sum + h.par, 0);

/** Keeps only whole stroke totals above zero under a hole-count key, so stale or hand-edited data cannot throw. */
export function cleanBestRounds(raw: unknown): BestRounds {
  const out: BestRounds = {};
  if (!isRecord(raw)) return out;
  for (const [holes, value] of Object.entries(raw)) {
    const strokes = Math.floor(savedNumber(value));
    if (/^[1-9]\d*$/.test(holes) && strokes > 0) out[holes] = strokes;
  }
  return out;
}

/**
 * The best stroke total for a round of `holes` holes, or 0 for none. Players from before this record
 * have only the arcade score, which was always set on the 9-hole course, so it is read back for that
 * course and no other.
 */
export function bestFor(rounds: BestRounds, holes: number, highScore: number): number {
  return rounds[holes] ?? (holes === LEGACY_HOLES ? totalFromScore(highScore, holes) : 0);
}

/** The record after a round of `holes` holes took `strokes`. Never changes `rounds` itself. */
export function withRound(rounds: BestRounds, holes: number, strokes: number, highScore: number): BestRounds {
  const best = bestFor(rounds, holes, highScore);
  return best > 0 && best <= strokes ? { ...rounds, [holes]: best } : { ...rounds, [holes]: strokes };
}

export function loadBestRounds(): BestRounds {
  return cleanBestRounds(loadJSON<unknown>(BEST_ROUNDS_KEY, {}));
}

/** Saves a finished round of today's course. `highScore` is the arcade best from before this round. */
export function recordRound(strokes: number, highScore: number): void {
  saveJSON(BEST_ROUNDS_KEY, withRound(loadBestRounds(), HOLES.length, strokes, highScore));
}

/** Today's course's best round, or 0 for none. */
export function bestRound(highScore: number): number {
  return bestFor(loadBestRounds(), HOLES.length, highScore);
}

/** The best round as golfers say it, e.g. "28 (-3)", or null before a round is finished. */
export function bestRoundText(highScore: number): string | null {
  const best = bestRound(highScore);
  return best > 0 ? `${best} (${toPar(best - PAR_TOTAL)})` : null;
}
