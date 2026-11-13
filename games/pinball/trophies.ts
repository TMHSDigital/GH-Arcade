import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'pinball.lanes', title: 'Lane Lighter', description: 'Light all three top lanes' },
  { id: 'pinball.bank', title: 'Target Practice', description: 'Knock down the whole drop-target bank' },
  { id: 'pinball.multi', title: 'Maxed Out', description: 'Reach the x5 multiplier' },
  { id: 'pinball.score', title: 'Table Wizard', description: 'Score 50,000 in Neon Pinball' },
] as const satisfies readonly TrophyDef[];
