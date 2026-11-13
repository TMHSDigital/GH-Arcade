import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'pong.win', title: 'Table Champion', description: 'Beat the CPU' },
  { id: 'pong.shutout', title: 'Clean Sheet', description: 'Beat the CPU 7-0' },
  { id: 'pong.rally', title: 'Long Rally', description: 'Keep a rally going for 20 hits', threshold: 20 },
  { id: 'pong.versus', title: 'Friendly Match', description: 'Finish a two-player match' },
] as const satisfies readonly TrophyDef[];
