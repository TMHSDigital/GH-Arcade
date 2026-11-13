import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'astro.saucer', title: 'Saucer Down', description: 'Shoot down a saucer' },
  { id: 'astro.wave5', title: 'Wave Rider', description: 'Reach wave 5' },
  { id: 'astro.score', title: 'Rock Crusher', description: 'Score 10,000 points' },
  { id: 'astro.rocks', title: 'Demolition Crew', description: 'Destroy 500 rocks in total', counter: 'astro.rocks', target: 500 },
] as const satisfies readonly TrophyDef[];
