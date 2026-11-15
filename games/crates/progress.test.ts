import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { cleanProgress, firstUnsolved, parCount, recordSolve, solvedCount, totalScore } from './progress';

const [a, b] = LEVELS;

describe('cleanProgress', () => {
  it('keeps whole positive move counts for known levels', () => {
    expect(cleanProgress({ [a.name]: 12, [b.name]: 30.7 })).toEqual({ [a.name]: 12, [b.name]: 30 });
  });

  it('drops anything else', () => {
    expect(cleanProgress(null)).toEqual({});
    expect(cleanProgress([5])).toEqual({});
    expect(cleanProgress({ [a.name]: -3, [b.name]: 'ten', 'No Such Level': 9 })).toEqual({});
    expect(cleanProgress({ [a.name]: Infinity })).toEqual({});
  });
});

describe('recordSolve', () => {
  it('saves a first solve and any better one, but not a worse one', () => {
    let r = recordSolve({}, a.name, 20);
    expect(r).toEqual({ progress: { [a.name]: 20 }, improved: true });
    r = recordSolve(r.progress, a.name, 25);
    expect(r.improved).toBe(false);
    expect(r.progress[a.name]).toBe(20);
    r = recordSolve(r.progress, a.name, 15);
    expect(r).toEqual({ progress: { [a.name]: 15 }, improved: true });
  });

  it('does not change the progress it was given', () => {
    const before = { [a.name]: 20 };
    recordSolve(before, a.name, 10);
    expect(before[a.name]).toBe(20);
  });
});

describe('summaries', () => {
  it('count solved and par levels and add up the score', () => {
    const progress = { [a.name]: a.par, [b.name]: b.par * 2 };
    expect(solvedCount(progress)).toBe(2);
    expect(parCount(progress)).toBe(1);
    expect(totalScore(progress)).toBe(1500);
    expect(totalScore({})).toBe(0);
  });

  it('point at the first unsolved level, or the first once every level is solved', () => {
    expect(firstUnsolved({})).toBe(0);
    expect(firstUnsolved({ [a.name]: 5 })).toBe(1);
    expect(firstUnsolved(Object.fromEntries(LEVELS.map((l) => [l.name, l.par])))).toBe(0);
  });
});
