import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRng, DAILY_KEEP, DAILY_MODES, dailyResult, dailyRng, dailySeed, dailyStreak, getDailyBest, getDailyHistory, submitDailyScore } from './rng';
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
    // One record per game, not one key per day.
    expect(JSON.parse(storage.data.get('gh-arcade:stack:daily')!)).toEqual({ '2026-11-12': 500, '2026-11-13': 100 });
    expect(storage.data.size).toBe(1);
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

describe('daily history', () => {
  it('lists the best for each day played', () => {
    installMemoryStorage();
    submitDailyScore('hop', 300, '2026-11-10');
    submitDailyScore('hop', 500, '2026-11-12');
    submitDailyScore('hop', 200, '2026-11-12');
    expect(getDailyHistory('hop')).toEqual({ '2026-11-10': 300, '2026-11-12': 500 });
    expect(getDailyHistory('runner')).toEqual({});
  });

  it('is empty, and scores are not records, when storage is unavailable', () => {
    expect(getDailyHistory('hop')).toEqual({});
    expect(getDailyBest('hop', '2026-11-12')).toBe(0);
  });

  it('folds daily bests saved one key per day into the record and removes the old keys', () => {
    const storage = installMemoryStorage({
      'gh-arcade:stack:daily:2026-11-11': '900',
      'gh-arcade:stack:daily:2026-11-12': '400',
      'gh-arcade:stack:daily': JSON.stringify({ '2026-11-12': 700, '2026-11-13': 50 }),
      'gh-arcade:hop:daily:2026-11-12': '33',
    });
    expect(getDailyHistory('stack')).toEqual({ '2026-11-11': 900, '2026-11-12': 700, '2026-11-13': 50 });
    expect([...storage.data.keys()].sort()).toEqual(['gh-arcade:hop:daily:2026-11-12', 'gh-arcade:stack:daily']);
    expect(getDailyBest('hop', '2026-11-12')).toBe(33);
    expect([...storage.data.keys()].sort()).toEqual(['gh-arcade:hop:daily', 'gh-arcade:stack:daily']);
  });

  it('ignores malformed saved entries', () => {
    installMemoryStorage({ 'gh-arcade:hop:daily': JSON.stringify({ '2026-11-12': 'lots', tomorrow: 5, '2026-11-13': -2, '2026-11-14': 80 }) });
    expect(getDailyHistory('hop')).toEqual({ '2026-11-14': 80 });
    installMemoryStorage({ 'gh-arcade:hop:daily': '[1,2]' });
    expect(getDailyHistory('hop')).toEqual({});
  });

  it('keeps only the newest days', () => {
    installMemoryStorage();
    const start = Date.parse('2026-01-01T00:00:00Z');
    const days = Array.from({ length: DAILY_KEEP + 5 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
    for (const day of days) submitDailyScore('hop', 10, day);
    const kept = Object.keys(getDailyHistory('hop')).sort();
    expect(kept).toHaveLength(DAILY_KEEP);
    expect(kept[0]).toBe(days[5]);
    expect(kept.at(-1)).toBe(days.at(-1));
  });
});

describe('dailyStreak', () => {
  const play = (...days: string[]) => days.forEach((day) => submitDailyScore('hop', 10, day));

  it('is 0 before the first daily run', () => {
    installMemoryStorage();
    expect(dailyStreak('hop', '2026-11-13')).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    installMemoryStorage();
    play('2026-11-11', '2026-11-12', '2026-11-13');
    expect(dailyStreak('hop', '2026-11-13')).toBe(3);
  });

  it('still stands when today has not been played yet, and ends after a missed day', () => {
    installMemoryStorage();
    play('2026-11-11', '2026-11-12');
    expect(dailyStreak('hop', '2026-11-13')).toBe(2);
    expect(dailyStreak('hop', '2026-11-14')).toBe(0);
  });

  it('stops at a gap and crosses month and year ends', () => {
    installMemoryStorage();
    play('2025-12-29', '2025-12-31', '2026-01-01', '2026-02-28', '2026-03-01');
    expect(dailyStreak('hop', '2026-01-01')).toBe(2);
    expect(dailyStreak('hop', '2026-03-01')).toBe(2);
  });
});
