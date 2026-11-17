import type { SaveKeyMerge } from '../../shared/backup';
import type { TrophyDef } from '../../shared/trophy-types';
import { MODE_BEST_KEY } from './best';

/** The best per mode, cleared with the arcade's best scores. */
export const BEST_KEYS = [MODE_BEST_KEY];

/** What this game saves for itself, so backups carry it: the highest score per mode. */
export const SAVE_KEYS: Record<string, SaveKeyMerge> = { [MODE_BEST_KEY]: 'higher' };

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'match.chain', title: 'Chain Reaction', description: 'Set off a cascade 4 chains long', threshold: 4 },
  { id: 'match.bomb', title: 'Big Bang', description: 'Detonate a bomb gem' },
  { id: 'match.score', title: 'Gem Cutter', description: 'Score 5,000 points in one game', threshold: 5000 },
  { id: 'match.gems', title: 'Treasure Trove', description: 'Clear 2,000 gems in total', counter: 'match.gems', target: 2000 },
] as const satisfies readonly TrophyDef[];
