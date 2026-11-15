import { describe, expect, it } from 'vitest';
import { HOLE_POINTS, MAX_STROKES } from './config';
import { HOLES } from './holes';
import { atCap, resultName, roundScore, scorecardLines, summarize, toPar, totalFromScore, withPenalty } from './scoring';

describe('strokes', () => {
  it('a water penalty adds a stroke, but never past the cap', () => {
    expect(withPenalty(2)).toBe(3);
    expect(withPenalty(MAX_STROKES - 1)).toBe(MAX_STROKES);
    expect(withPenalty(MAX_STROKES)).toBe(MAX_STROKES);
  });

  it('the ball is picked up at the cap', () => {
    expect(atCap(MAX_STROKES - 1)).toBe(false);
    expect(atCap(MAX_STROKES)).toBe(true);
  });

  it('results have their golf names', () => {
    expect(resultName(1, 3)).toBe('HOLE IN ONE');
    expect(resultName(1, 2)).toBe('HOLE IN ONE');
    expect(resultName(2, 5)).toBe('ALBATROSS');
    expect(resultName(3, 5)).toBe('EAGLE');
    expect(resultName(2, 3)).toBe('BIRDIE');
    expect(resultName(3, 3)).toBe('PAR');
    expect(resultName(4, 3)).toBe('BOGEY');
    expect(resultName(5, 3)).toBe('DOUBLE BOGEY');
    expect(resultName(7, 3)).toBe('+4');
  });

  it('strokes against par read E, +n or -n', () => {
    expect(toPar(0)).toBe('E');
    expect(toPar(3)).toBe('+3');
    expect(toPar(-2)).toBe('-2');
  });
});

describe('round score', () => {
  it('is higher for fewer strokes, so the best score is the best round', () => {
    const good = roundScore([2, 3, 3]);
    const worse = roundScore([2, 3, 4]);
    expect(good).toBeGreaterThan(worse);
    expect(good - worse).toBe(HOLE_POINTS);
    expect(roundScore([])).toBe(0);
  });

  it('gives every completed hole some points, even at the cap', () => {
    expect(roundScore([MAX_STROKES])).toBe(HOLE_POINTS);
    expect(roundScore([1])).toBe(MAX_STROKES * HOLE_POINTS);
  });

  it('turns back into the round total', () => {
    const strokes = [2, 3, 4, 3, 2, 5, 4, 3, 6];
    expect(totalFromScore(roundScore(strokes), strokes.length)).toBe(32);
    expect(totalFromScore(0, 9)).toBe(0);
  });
});

describe('summary and scorecard', () => {
  const pars = HOLES.map((h) => h.par);

  it('adds up strokes against par, birdies, aces and a clean card', () => {
    const s = summarize([1, 3, 2], [2, 3, 3]);
    expect(s).toEqual({ total: 6, par: 8, diff: -2, birdies: 2, aces: 1, clean: true });
    expect(summarize([3, 3], [2, 3]).clean).toBe(false);
    expect(summarize([], pars)).toEqual({ total: 0, par: 0, diff: 0, birdies: 0, aces: 0, clean: true });
  });

  it('lays the card out in matching columns, with dashes for holes to come', () => {
    const lines = scorecardLines([2, 4], pars);
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
    expect(lines[0].startsWith('HOLE  1  2  3')).toBe(true);
    expect(lines[2].startsWith('YOU   2  4  -')).toBe(true);
    expect(lines[2].trim().endsWith(' 6')).toBe(true);
    expect(lines[1].trim().endsWith(String(pars.reduce((a, b) => a + b, 0)))).toBe(true);
    expect(scorecardLines([], pars)[2].trim().endsWith('-')).toBe(true);
  });
});
