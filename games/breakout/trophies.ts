import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'breakout.clear', title: 'Brick by Brick', description: 'Clear the first level' },
  { id: 'breakout.combo', title: 'Chain Reaction', description: 'Reach an x8 combo', threshold: 8 },
  { id: 'breakout.multi', title: 'Crowd Control', description: 'Have 5 balls in play at once', threshold: 5 },
  { id: 'breakout.score', title: 'High Roller', description: 'Score 10,000 points', threshold: 10000 },
] as const satisfies readonly TrophyDef[];
