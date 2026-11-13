import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically. Add rows
 * like the commented example, then unlock them from the game with the typed helpers:
 *
 *   import { trophiesFor } from '../../../shared/achievements';
 *   import type { TROPHIES } from '../trophies';
 *   const { unlock, addCounter } = trophiesFor<typeof TROPHIES>();
 *   unlock('__SLUG__.first');
 */
export const TROPHIES = [
  // { id: '__SLUG__.first', title: 'First Steps', description: 'Collect 10 dots in one run' },
  // { id: '__SLUG__.dots', title: 'Dot Hoarder', description: 'Collect 500 dots in total', counter: '__SLUG__.dots', target: 500 },
] as const satisfies readonly TrophyDef[];
