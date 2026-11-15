import type { TrophyDef } from '../../shared/trophy-types';

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
