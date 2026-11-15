import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'lander.touchdown', title: 'Touchdown', description: 'Land safely on a pad' },
  { id: 'lander.feather', title: 'Featherlight', description: 'Make a soft landing for the bonus' },
  { id: 'lander.stage5', title: 'Deep Space', description: 'Reach stage 5', threshold: 5 },
  { id: 'lander.score', title: 'Ace Pilot', description: 'Score 3,000 points', threshold: 3000 },
] as const satisfies readonly TrophyDef[];
