import { describe, expect, it } from 'vitest';
import { LEVEL_MULT, ROUNDS_TO_WIN } from './config';
import { matchScore, matchWinner, nextStreak, other, readStreak, roundWinner } from './match';

describe('roundWinner', () => {
  it('names the tank left standing, a draw when both fall, and nobody while both live', () => {
    expect(roundWinner([40, 0])).toBe(0);
    expect(roundWinner([0, 12])).toBe(1);
    expect(roundWinner([-5, 0])).toBe('draw');
    expect(roundWinner([1, 1])).toBeNull();
  });
});

describe('matchWinner', () => {
  it('is decided at the rounds needed to win', () => {
    expect(matchWinner([0, 0])).toBeNull();
    expect(matchWinner([ROUNDS_TO_WIN - 1, ROUNDS_TO_WIN - 1])).toBeNull();
    expect(matchWinner([ROUNDS_TO_WIN, 1])).toBe(0);
    expect(matchWinner([0, ROUNDS_TO_WIN])).toBe(1);
  });

  it('swaps seats', () => {
    expect(other(0)).toBe(1);
    expect(other(1)).toBe(0);
  });
});

describe('matchScore', () => {
  it('rewards winning, rounds and damage, scaled by the CPU strength', () => {
    const lost = matchScore({ won: false, roundsWon: 1, damageDealt: 120, level: 'normal' });
    const won = matchScore({ won: true, roundsWon: 2, damageDealt: 200, level: 'normal' });
    expect(won).toBeGreaterThan(lost);
    expect(matchScore({ won: true, roundsWon: 2, damageDealt: 200, level: 'hard' })).toBe((won / LEVEL_MULT.normal) * LEVEL_MULT.hard);
    expect(matchScore({ won: false, roundsWon: 0, damageDealt: 0, level: 'easy' })).toBe(0);
  });
});

describe('win streak', () => {
  it('grows on a win, resets on a loss, and remembers the best', () => {
    let s = readStreak(undefined);
    expect(s).toEqual({ current: 0, best: 0 });
    s = nextStreak(s, true);
    s = nextStreak(s, true);
    expect(s).toEqual({ current: 2, best: 2 });
    s = nextStreak(s, false);
    expect(s).toEqual({ current: 0, best: 2 });
  });

  it('reads saved data defensively', () => {
    expect(readStreak({ current: 3, best: 5 })).toEqual({ current: 3, best: 5 });
    expect(readStreak({ current: 4, best: 1 })).toEqual({ current: 4, best: 4 });
    expect(readStreak({ current: 'x', best: -2 })).toEqual({ current: 0, best: 0 });
    expect(readStreak(null)).toEqual({ current: 0, best: 0 });
    expect(readStreak(42)).toEqual({ current: 0, best: 0 });
  });
});
