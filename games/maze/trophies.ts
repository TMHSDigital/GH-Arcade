import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'maze.clear', title: 'Maze Runner', description: 'Clear every dot from a maze' },
  { id: 'maze.sweep', title: 'Clean Sweep', description: 'Catch all four chasers on one power cell' },
  { id: 'maze.level3', title: 'Deeper In', description: 'Reach level 3 in Neon Maze', threshold: 3 },
  { id: 'maze.score', title: 'High Voltage', description: 'Score 10,000 in Neon Maze', threshold: 10000 },
] as const satisfies readonly TrophyDef[];
