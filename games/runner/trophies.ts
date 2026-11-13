import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'runner.1k', title: 'First Kilometre', description: 'Run 1,000m in one run', threshold: 1000 },
  { id: 'runner.3k', title: 'Marathoner', description: 'Run 3,000m in one run', threshold: 3000 },
  { id: 'runner.coins', title: 'Pocket Change', description: 'Collect 20 coins in one run', threshold: 20 },
  { id: 'runner.bank', title: 'Treasure Hunter', description: 'Collect 500 coins in total', counter: 'runner.coins', target: 500 },
] as const satisfies readonly TrophyDef[];
