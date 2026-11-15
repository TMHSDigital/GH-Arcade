import type { TrophyDef } from '../../shared/trophy-types';

/**
 * This game's trophies. The arcade collects every games/<slug>/trophies.ts automatically. The game
 * unlocks them through the typed helpers from `trophiesFor<typeof TROPHIES>()`.
 */
export const TROPHIES = [
  { id: 'bubbles.drop', title: 'Avalanche', description: 'Drop 10 bubbles with one shot', threshold: 10 },
  { id: 'bubbles.clear', title: 'Clean Sweep', description: 'Clear the whole field' },
  { id: 'bubbles.score', title: 'Bubble Baron', description: 'Score 25,000 points', threshold: 25000 },
  { id: 'bubbles.popped', title: 'Pop Star', description: 'Pop 1,000 bubbles in total', counter: 'bubbles.popped', target: 1000 },
] as const satisfies readonly TrophyDef[];
