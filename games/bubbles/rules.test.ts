import { describe, expect, it } from 'vitest';
import {
  BASE_SHOTS_PER_DROP,
  CLEAR_BONUS,
  CLEAR_BONUS_PER_LEVEL,
  DROP_POINTS,
  MAX_COLORS,
  MAX_STREAK,
  MIN_SHOTS_PER_DROP,
  POP_POINTS,
  SHOTS_PER_LEVEL,
  START_COLORS,
} from './config';
import { createGrid } from './grid';
import { clearBonus, colorCount, dropScore, levelFor, pickColor, refreshQueue, shotScore, shotsPerDrop, streakMultiplier } from './rules';

/** A repeatable stand-in for Math.random. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('scoring', () => {
  it('makes each fallen bubble worth more than the last', () => {
    expect(dropScore(0)).toBe(0);
    expect(dropScore(1)).toBe(DROP_POINTS);
    expect(dropScore(2)).toBe(DROP_POINTS * 3);
    expect(dropScore(10)).toBe(DROP_POINTS * 55);
    for (let n = 1; n < 20; n++) expect(dropScore(n + 1) - dropScore(n)).toBeGreaterThan(dropScore(n) - dropScore(n - 1));
  });

  it('scores pops and drops together, times the streak', () => {
    expect(shotScore(3, 0, 1)).toBe(3 * POP_POINTS);
    expect(shotScore(3, 2, 1)).toBe(3 * POP_POINTS + dropScore(2));
    expect(shotScore(4, 1, 2)).toBe((4 * POP_POINTS + dropScore(1)) * 2);
  });

  it('gives nothing for a shot that popped nothing', () => {
    expect(shotScore(0, 0, 3)).toBe(0);
  });

  it('caps the streak multiplier', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(1)).toBe(1);
    expect(streakMultiplier(3)).toBe(3);
    expect(streakMultiplier(99)).toBe(MAX_STREAK);
  });

  it('grows the clear bonus with the level', () => {
    expect(clearBonus(1)).toBe(CLEAR_BONUS + CLEAR_BONUS_PER_LEVEL);
    expect(clearBonus(4) - clearBonus(3)).toBe(CLEAR_BONUS_PER_LEVEL);
  });
});

describe('difficulty', () => {
  it('levels up with shots and with every cleared field', () => {
    expect(levelFor(0, 0)).toBe(1);
    expect(levelFor(SHOTS_PER_LEVEL - 1, 0)).toBe(1);
    expect(levelFor(SHOTS_PER_LEVEL, 0)).toBe(2);
    expect(levelFor(SHOTS_PER_LEVEL * 3 + 4, 2)).toBe(6);
  });

  it('adds a color every two levels, up to the most there are', () => {
    expect(colorCount(1)).toBe(START_COLORS);
    expect(colorCount(2)).toBe(START_COLORS);
    expect(colorCount(3)).toBe(START_COLORS + 1);
    expect(colorCount(100)).toBe(MAX_COLORS);
    expect(colorCount(0)).toBe(START_COLORS);
  });

  it('drops the ceiling sooner at higher levels, never below the minimum', () => {
    expect(shotsPerDrop(1)).toBe(BASE_SHOTS_PER_DROP);
    expect(shotsPerDrop(3)).toBe(BASE_SHOTS_PER_DROP - 1);
    expect(shotsPerDrop(100)).toBe(MIN_SHOTS_PER_DROP);
    for (let level = 1; level < 30; level++) expect(shotsPerDrop(level + 1)).toBeLessThanOrEqual(shotsPerDrop(level));
  });
});

describe('the launcher queue', () => {
  it('loads only colors still on the field', () => {
    const grid = createGrid(8, 4);
    grid.cells[0][0] = 2;
    grid.cells[0][1] = 5;
    for (const r of [0, 0.3, 0.6, 0.99]) expect([2, 5]).toContain(pickColor(grid, 6, () => r));
  });

  it('loads any color in play when the field is empty', () => {
    const grid = createGrid(8, 4);
    expect(pickColor(grid, 4, () => 0)).toBe(0);
    expect(pickColor(grid, 4, () => 0.99)).toBe(3);
  });

  it('swaps out loaded colors that are gone from the field', () => {
    const grid = createGrid(8, 4);
    grid.cells[0][0] = 1;
    expect(refreshQueue(grid, [3, 1], 4, sequence(0))).toEqual([1, 1]);
    expect(refreshQueue(grid, [1, 1], 4, sequence(0))).toEqual([1, 1]);
  });

  it('keeps the queue while the field is empty', () => {
    expect(refreshQueue(createGrid(8, 4), [3, 2], 4)).toEqual([3, 2]);
  });
});
