import type { SaveKeyMerge } from '../../shared/backup';
import type { TrophyDef } from '../../shared/trophy-types';
import { STREAK_KEY } from './config';

/** What this game saves for itself, so backups carry it: the vs-CPU win streak and best streak. */
export const SAVE_KEYS: Record<string, SaveKeyMerge> = { [STREAK_KEY]: 'higher' };

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, and the
 * game unlocks them through the typed helpers from `trophiesFor<typeof TROPHIES>()`.
 */
export const TROPHIES = [
  { id: 'tanks.win', title: 'Tank Commander', description: 'Win a match against the CPU (not on easy)' },
  { id: 'tanks.longshot', title: 'Long Shot', description: 'Score a direct hit on a tank 500 pixels away', threshold: 500 },
  { id: 'tanks.streak', title: 'Unstoppable', description: 'Win 3 matches in a row against the CPU', threshold: 3 },
  { id: 'tanks.versus', title: 'Hot Seat', description: 'Finish a two-player match' },
] as const satisfies readonly TrophyDef[];
