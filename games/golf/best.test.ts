import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEST_ROUNDS_KEY, bestFor, bestRoundText, cleanBestRounds, LEGACY_HOLES, recordRound, withRound } from './best';
import { HOLES } from './holes';
import { roundScore, toPar } from './scoring';
import { BEST_KEYS, bestLabel, SAVE_KEYS } from './trophies';
import { installMemoryStorage } from '../../shared/test-utils';

const PAR_TOTAL = HOLES.reduce((sum, h) => sum + h.par, 0);
const stored = (storage: ReturnType<typeof installMemoryStorage>) => JSON.parse(storage.data.get(`gh-arcade:${BEST_ROUNDS_KEY}`) ?? 'null');

afterEach(() => vi.unstubAllGlobals());

describe('best round', () => {
  it('is today\'s course length, which every older arcade score was set on', () => {
    expect(HOLES.length).toBe(LEGACY_HOLES);
  });

  it('keeps only whole stroke totals under a hole count', () => {
    expect(cleanBestRounds({ '9': 28.7, '12': 40, '0': 3, 'x': 5, '18': -2, '10': 'a' })).toEqual({ '9': 28, '12': 40 });
    expect(cleanBestRounds(null)).toEqual({});
  });

  it('reads an older save from the arcade score, for the 9-hole course only', () => {
    const score = roundScore([3, 3, 3, 3, 3, 3, 3, 3, 4]);
    expect(bestFor({}, 9, score)).toBe(28);
    expect(bestFor({}, 10, score)).toBe(0);
    expect(bestFor({}, 9, 0)).toBe(0);
    expect(bestFor({ '9': 25 }, 9, score)).toBe(25);
  });

  it('keeps the fewer strokes per course length', () => {
    expect(withRound({}, 9, 30, 0)).toEqual({ '9': 30 });
    expect(withRound({ '9': 30 }, 9, 27, 0)).toEqual({ '9': 27 });
    expect(withRound({ '9': 27 }, 9, 31, 0)).toEqual({ '9': 27 });
    expect(withRound({ '9': 27 }, 10, 35, 0)).toEqual({ '9': 27, '10': 35 });
    // An older save's best is carried into the record rather than lost to a worse round.
    expect(withRound({}, 9, 33, roundScore([3, 3, 3, 3, 3, 3, 3, 3, 4]))).toEqual({ '9': 28 });
  });

  it('stays right when a hole is added: a longer course starts its own record', () => {
    const rounds = { '9': 28 };
    expect(bestFor(rounds, 10, roundScore([3, 3, 3, 3, 3, 3, 3, 3, 4]))).toBe(0);
    expect(bestFor(rounds, 9, 0)).toBe(28);
  });

  it('records a finished round and words it in strokes against par', () => {
    const storage = installMemoryStorage();
    expect(bestRoundText(0)).toBeNull();
    recordRound(PAR_TOTAL - 2, 0);
    expect(stored(storage)).toEqual({ [HOLES.length]: PAR_TOTAL - 2 });
    expect(bestRoundText(0)).toBe(`${PAR_TOTAL - 2} (-2)`);
    recordRound(PAR_TOTAL + 5, 0);
    expect(stored(storage)).toEqual({ [HOLES.length]: PAR_TOTAL - 2 });
  });
});

describe('golf on the hub', () => {
  it('shows the best round in strokes, not the points total', () => {
    installMemoryStorage();
    const score = roundScore([3, 3, 3, 3, 3, 3, 3, 3, 4]);
    expect(bestLabel(score)).toBe(`Best round 28 (${toPar(28 - PAR_TOTAL)})`);
    expect(bestLabel(0)).toBeNull();
  });

  it('is backed up and reset with the other bests', () => {
    expect(BEST_KEYS).toContain(BEST_ROUNDS_KEY);
    expect(SAVE_KEYS[BEST_ROUNDS_KEY]).toBe('lower');
  });
});
