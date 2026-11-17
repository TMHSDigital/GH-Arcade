import { describe, expect, it } from 'vitest';
import { allMoves, colorRows, fillBoard, findMove, reshuffle, resolveAll, swapGems } from './rules';
import { dailyRng } from '../../shared/rng';

// GAME_ID in config.ts; that module loads Phaser, so the id is repeated here.
const GAME_ID = 'match';

/**
 * Plays a daily the way the game scene does: one seeded sequence for the first fill, every refill
 * and any reshuffle, with the same swaps each time. Returns every board along the way.
 */
function playDaily(day: string, swaps: number): string[][] {
  const random = dailyRng(GAME_ID, day, 'board').next;
  const board = fillBoard(random);
  const seen = [colorRows(board)];
  for (let i = 0; i < swaps; i++) {
    const [a, b] = allMoves(board)[0];
    swapGems(board, a, b);
    resolveAll(board, random, [a, b]);
    if (!findMove(board)) reshuffle(board, random);
    seen.push(colorRows(board));
  }
  return seen;
}

describe('Match daily', () => {
  it('gives the same boards to two runs of the same day with the same swaps', () => {
    expect(playDaily('2026-11-16', 12)).toEqual(playDaily('2026-11-16', 12));
  });

  it('deals a different board on another day', () => {
    expect(playDaily('2026-11-17', 0)[0]).not.toEqual(playDaily('2026-11-16', 0)[0]);
  });
});
