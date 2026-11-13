import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRng, dailySeed, getDailyBest, submitDailyScore } from './rng';
import { installMemoryStorage } from './test-utils';

afterEach(() => vi.unstubAllGlobals());

const take = (seed: number | string, n = 8) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take(42)).toEqual(take(42));
    expect(take('2026-11-12')).toEqual(take('2026-11-12'));
  });

  it('gives different sequences for different seeds', () => {
    expect(take(1)).not.toEqual(take(2));
    expect(take('2026-11-12')).not.toEqual(take('2026-11-13'));
  });

  it('next stays in [0, 1) and is roughly uniform', () => {
    const rng = createRng('uniform');
    let sum = 0;
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 5000).toBeGreaterThan(0.45);
    expect(sum / 5000).toBeLessThan(0.55);
  });

  it('next works when passed around on its own', () => {
    const { next } = createRng(7);
    expect(typeof next()).toBe('number');
  });

  it('between covers both ends and nothing outside', () => {
    const rng = createRng('range');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.between(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
    expect(rng.between(5, 5)).toBe(5);
  });

  it('pick returns items from the list', () => {
    const rng = createRng('pick');
    const list = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(rng.pick(list));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
  });

  it('shuffle returns a permutation and leaves the input alone', () => {
    const list = [1, 2, 3, 4, 5, 6, 7];
    const shuffled = createRng('shuffle').shuffle(list);
    expect(list).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect([...shuffled].sort()).toEqual(list);
    expect(createRng('shuffle').shuffle(list)).toEqual(shuffled);
  });
});

describe('daily challenge', () => {
  it('dailySeed is the UTC date', () => {
    expect(dailySeed(new Date('2026-11-12T23:59:59Z'))).toBe('2026-11-12');
    expect(dailySeed(new Date('2026-11-13T00:00:00Z'))).toBe('2026-11-13');
    // Late evening in a timezone west of UTC is already the next UTC day.
    expect(dailySeed(new Date('2026-11-12T20:00:00-05:00'))).toBe('2026-11-13');
  });

  it('keeps a best score per game and day', () => {
    const storage = installMemoryStorage();
    expect(getDailyBest('stack', '2026-11-12')).toBe(0);
    expect(submitDailyScore('stack', 500, '2026-11-12')).toBe(true);
    expect(submitDailyScore('stack', 400, '2026-11-12')).toBe(false);
    expect(submitDailyScore('stack', 100, '2026-11-13')).toBe(true);
    expect(getDailyBest('stack', '2026-11-12')).toBe(500);
    expect(getDailyBest('snake', '2026-11-12')).toBe(0);
    expect(storage.data.get('gh-arcade:stack:daily:2026-11-12')).toBe('500');
  });
});
