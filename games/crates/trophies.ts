import type { SaveKeyMerge } from '../../shared/backup';
import type { TrophyDef } from '../../shared/trophy-types';
import { BEST_KEY } from './config';

/** What this game saves for itself, so backups carry it: the fewest moves per level. */
export const SAVE_KEYS: Record<string, SaveKeyMerge> = { [BEST_KEY]: 'lower' };

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'crates.first', title: 'Unboxed', description: 'Solve your first level' },
  { id: 'crates.par', title: 'By the Book', description: 'Solve a level in par moves' },
  { id: 'crates.half', title: 'Halfway Haul', description: 'Solve 8 levels', threshold: 8 },
  { id: 'crates.all', title: 'Master Mover', description: 'Solve all 15 levels', threshold: 15 },
] as const satisfies readonly TrophyDef[];
