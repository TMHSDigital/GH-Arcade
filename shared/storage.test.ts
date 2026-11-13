import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHighScore, loadJSON, saveJSON, submitHighScore } from './storage';
import { installMemoryStorage } from './test-utils';

afterEach(() => vi.unstubAllGlobals());

describe('loadJSON', () => {
  it('returns the fallback when nothing is stored', () => {
    installMemoryStorage();
    expect(loadJSON('missing', 'fallback')).toBe('fallback');
  });

  it('returns the fallback when storage is unavailable', () => {
    // No localStorage global at all, as in a blocked-storage browser.
    expect(loadJSON('anything', 7)).toBe(7);
  });

  it('returns the fallback when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadJSON('anything', 7)).toBe(7);
  });

  it('returns the fallback on invalid JSON', () => {
    installMemoryStorage({ 'gh-arcade:broken': '{not json' });
    expect(loadJSON('broken', 'fallback')).toBe('fallback');
  });

  it('parses a stored value', () => {
    installMemoryStorage({ 'gh-arcade:thing': '{"a":1}' });
    expect(loadJSON('thing', {})).toEqual({ a: 1 });
  });
});

describe('saveJSON', () => {
  it('writes under the gh-arcade: prefix', () => {
    const storage = installMemoryStorage();
    saveJSON('thing', { a: 1 });
    expect(storage.data.get('gh-arcade:thing')).toBe('{"a":1}');
  });

  it('swallows a throwing setItem', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => saveJSON('thing', 1)).not.toThrow();
  });
});

describe('high scores', () => {
  it('only a strictly higher score is a record', () => {
    installMemoryStorage();
    expect(submitHighScore('snake', 0)).toBe(false);
    expect(submitHighScore('snake', 10)).toBe(true);
    expect(submitHighScore('snake', 10)).toBe(false);
    expect(submitHighScore('snake', 9)).toBe(false);
    expect(submitHighScore('snake', 11)).toBe(true);
    expect(getHighScore('snake')).toBe(11);
  });

  it('keeps scores per game', () => {
    installMemoryStorage();
    submitHighScore('snake', 5);
    expect(getHighScore('pong')).toBe(0);
  });

  it('treats a malformed stored score as no score', () => {
    installMemoryStorage({ 'gh-arcade:snake:highscore': '"abc"', 'gh-arcade:pong:highscore': '-5' });
    expect(getHighScore('snake')).toBe(0);
    expect(getHighScore('pong')).toBe(0);
    expect(submitHighScore('snake', 1)).toBe(true);
  });
});
