import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadJSON, saveJSON, savedNumber } from './storage';
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

describe('savedNumber', () => {
  it('passes finite positive numbers and turns anything else into 0', () => {
    expect(savedNumber(12)).toBe(12);
    for (const bad of [-5, NaN, Infinity, '12', null, undefined, {}]) expect(savedNumber(bad)).toBe(0);
  });
});
