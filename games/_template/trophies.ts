import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically. Add rows
 * like the commented example, then unlock them from the game with the typed helpers:
 *
 *   import { trophiesFor } from '../../../shared/achievements';
 *   import type { TROPHIES } from '../trophies';
 *   const { unlock, reach, addCounter } = trophiesFor<typeof TROPHIES>();
 *   reach('__SLUG__.first', dotsThisRun);   // unlocks at the row's `threshold`
 *   addCounter('__SLUG__.dots');            // unlocks at the row's `target`, across runs
 *   unlock('__SLUG__.secret');              // for one-off events
 */
export const TROPHIES = [
  // { id: '__SLUG__.first', title: 'First Steps', description: 'Collect 10 dots in one run', threshold: 10 },
  // { id: '__SLUG__.dots', title: 'Dot Hoarder', description: 'Collect 500 dots in total', counter: '__SLUG__.dots', target: 500 },
] as const satisfies readonly TrophyDef[];
