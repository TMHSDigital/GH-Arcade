import type { SaveKeyMerge } from '../../shared/backup';
import type { TrophyDef } from '../../shared/trophy-types';
import { BEST_ROUNDS_KEY, bestRoundText } from './best';

/** The best round per course length, cleared with the arcade's best scores. */
export const BEST_KEYS = [BEST_ROUNDS_KEY];

/** What this game saves for itself, so backups carry it: the fewest strokes per course length. */
export const SAVE_KEYS: Record<string, SaveKeyMerge> = { [BEST_ROUNDS_KEY]: 'lower' };

/**
 * What the hub card shows as this game's best. The arcade score is an internal points total, so the
 * card shows the best round in strokes instead.
 */
export function bestLabel(highScore: number): string | null {
  const text = bestRoundText(highScore);
  return text ? `Best round ${text}` : null;
}

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'golf.ace', title: 'Ace', description: 'Make a hole in one' },
  { id: 'golf.birdies', title: 'Birdie Watcher', description: 'Score 3 birdies or better in one round', threshold: 3 },
  { id: 'golf.clean', title: 'Clean Card', description: 'Make par or better on all nine holes' },
  { id: 'golf.under', title: 'Under Par', description: 'Finish a round under par' },
] as const satisfies readonly TrophyDef[];
