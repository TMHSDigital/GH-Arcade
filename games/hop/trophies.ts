import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'hop.home', title: 'Safe Harbor', description: 'Reach a dock' },
  { id: 'hop.full', title: 'Full House', description: 'Fill all five docks' },
  { id: 'hop.level3', title: 'Rush Hour', description: 'Reach level 3' },
  { id: 'hop.score', title: 'Road Warrior', description: 'Score 5,000 points' },
] as const satisfies readonly TrophyDef[];
