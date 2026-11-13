import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically, so adding
 * or changing a trophy never touches shared code. The game unlocks them through the typed helpers
 * from `trophiesFor<typeof TROPHIES>()`, which only accept the ids and counters listed here.
 */
export const TROPHIES = [
  { id: 'stack.quad', title: 'Quad Squad', description: 'Clear 4 lines at once' },
  { id: 'stack.b2b', title: 'Back to Back', description: 'Clear two quads in a row' },
  { id: 'stack.level5', title: 'Speed Stacker', description: 'Reach level 5', threshold: 5 },
  { id: 'stack.lines', title: 'Line Worker', description: 'Clear 100 lines in total', counter: 'stack.lines', target: 100 },
] as const satisfies readonly TrophyDef[];
