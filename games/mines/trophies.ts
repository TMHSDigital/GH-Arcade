import type { TrophyDef } from '../../shared/trophy-types';
import { BEST_TIMES_KEY } from './config';

/** The best time per difficulty, cleared with the arcade's best scores. */
export const BEST_KEYS = [BEST_TIMES_KEY];

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids listed here.
 */
export const TROPHIES = [
  { id: 'mines.clear', title: 'All Clear', description: 'Clear a board' },
  { id: 'mines.hard', title: 'Bomb Squad', description: 'Clear a hard board' },
  // A time is better the lower it is, so this one is unlocked by the game rather than by a threshold.
  { id: 'mines.speed', title: 'Quick Sweep', description: 'Clear an easy board in 30 seconds or less' },
  { id: 'mines.noflags', title: 'Bare Hands', description: 'Clear a medium or hard board without placing a flag' },
] as const satisfies readonly TrophyDef[];
