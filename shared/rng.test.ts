import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRng, DAILY_MODES, dailyResult, dailyRng, dailySeed, getDailyBest, submitDailyScore } from './rng';
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

describe('daily challenge helpers', () => {
  const first = (rng: { next: () => number }, n = 6) => Array.from({ length: n }, () => rng.next());

  it('offers a normal game and a daily one from the menu', () => {
    expect(DAILY_MODES.map((m) => m.label)).toEqual(['PLAY', 'DAILY']);
    expect(DAILY_MODES[1].data).toEqual({ daily: true });
  });

  it('dailyRng repeats for the same game, day and part', () => {
    expect(first(dailyRng('hop', '2026-11-13', 'lanes:2'))).toEqual(first(dailyRng('hop', '2026-11-13', 'lanes:2')));
  });

  it('dailyRng differs by game, by day and by part', () => {
    const base = first(dailyRng('hop', '2026-11-13', 'orbs'));
    expect(first(dailyRng('runner', '2026-11-13', 'orbs'))).not.toEqual(base);
    expect(first(dailyRng('hop', '2026-11-14', 'orbs'))).not.toEqual(base);
    expect(first(dailyRng('hop', '2026-11-13', 'lanes:1'))).not.toEqual(base);
  });

  it('dailyRng without a part is seeded with "<game>:<day>", as Neon Stack always was', () => {
    expect(first(dailyRng('stack', '2026-11-13'))).toEqual(first(createRng('stack:2026-11-13')));
  });

  it('dailyResult records the score and words the game-over line', () => {
    installMemoryStorage();
    expect(dailyResult('hop', 1200, '2026-11-13')).toBe('DAILY 2026-11-13   NEW BEST TODAY');
    expect(getDailyBest('hop', '2026-11-13')).toBe(1200);
    expect(dailyResult('hop', 900, '2026-11-13')).toBe(`DAILY 2026-11-13   TODAY'S BEST ${(1200).toLocaleString()}`);
    expect(getDailyBest('hop', '2026-11-13')).toBe(1200);
  });
});
