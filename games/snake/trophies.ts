import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'snake.bonus', title: 'Star Catcher', description: 'Eat a bonus star' },
  { id: 'snake.len25', title: 'Growth Spurt', description: 'Reach length 25' },
  { id: 'snake.len50', title: 'Neon Serpent', description: 'Reach length 50' },
  { id: 'snake.score', title: 'Snake Charmer', description: 'Score 1,000 points' },
] as const satisfies readonly TrophyDef[];
