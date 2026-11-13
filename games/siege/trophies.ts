import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'siege.wave3', title: 'Holding the Line', description: 'Clear wave 3' },
  { id: 'siege.mothership', title: 'Mothership Down', description: 'Shoot the mothership' },
  { id: 'siege.score', title: 'Star Defender', description: 'Score 5,000 points' },
  { id: 'siege.coop', title: 'Better Together', description: 'Clear a wave in two-player co-op' },
] as const satisfies readonly TrophyDef[];
