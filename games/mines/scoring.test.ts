import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY_ORDER } from './config';
import { formatTime, lossScore, parseBestTimes, winScore, withTime } from './scoring';

describe('scores', () => {
  it('rewards speed down to the par time, then only the base', () => {
    const d = DIFFICULTIES.easy;
    expect(winScore(d, 0)).toBe(d.base + d.par * d.perSecond);
    expect(winScore(d, d.par - 9.3)).toBe(d.base + 10 * d.perSecond);
    expect(winScore(d, d.par + 500)).toBe(d.base);
  });

  it('scores any win above any loss on the same board', () => {
    for (const id of DIFFICULTY_ORDER) {
      const d = DIFFICULTIES[id];
      const safe = d.cols * d.rows - d.mines;
      expect(winScore(d, 9999)).toBeGreaterThan(lossScore(d, safe));
    }
  });

  it('scores any win on a harder board above every win on an easier one', () => {
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      expect(winScore(DIFFICULTIES[DIFFICULTY_ORDER[i]], 9999)).toBeGreaterThan(winScore(DIFFICULTIES[DIFFICULTY_ORDER[i - 1]], 0));
    }
  });

  it('scores a loss by the cells cleared', () => {
    expect(lossScore(DIFFICULTIES.hard, 10)).toBe(10 * DIFFICULTIES.hard.perCell);
    expect(lossScore(DIFFICULTIES.hard, -3)).toBe(0);
  });
});

describe('best times', () => {
  it('reads only times for known difficulties', () => {
    expect(parseBestTimes({ easy: 42.9, medium: 'fast', hard: -1, expert: 3 })).toEqual({ easy: 42 });
    expect(parseBestTimes(null)).toEqual({});
    expect(parseBestTimes([1, 2])).toEqual({});
    expect(parseBestTimes({ hard: Infinity })).toEqual({});
  });

  it('keeps the faster time', () => {
    const first = withTime({}, 'easy', 50);
    expect(first).toEqual({ times: { easy: 50 }, isBest: true });
    expect(withTime(first.times, 'easy', 61).isBest).toBe(false);
    expect(withTime(first.times, 'easy', 50).isBest).toBe(false);
    expect(withTime(first.times, 'easy', 49.5)).toEqual({ times: { easy: 49 }, isBest: true });
    expect(withTime(first.times, 'hard', 300).times).toEqual({ easy: 50, hard: 300 });
  });

  it('leaves the old record untouched', () => {
    const old = { medium: 100 };
    withTime(old, 'medium', 80);
    expect(old).toEqual({ medium: 100 });
  });
});

describe('formatTime', () => {
  it('writes minutes and two-digit seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9.9)).toBe('0:09');
    expect(formatTime(83)).toBe('1:23');
    expect(formatTime(3600)).toBe('60:00');
    expect(formatTime(-4)).toBe('0:00');
  });
});
