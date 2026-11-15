import { describe, expect, it } from 'vitest';
import { normaliseTop, numberMap, TOP_SIZE } from './saved-shapes';

describe('numberMap', () => {
  it('keeps the finite numbers of an object and drops the rest', () => {
    expect(numberMap({ a: 1, b: 0, c: -2, d: 'x', e: null, f: Number.NaN, g: Infinity })).toEqual({ a: 1, b: 0, c: -2 });
  });

  it('is empty for anything that is not an object', () => {
    expect(numberMap(null)).toEqual({});
    expect(numberMap([1, 2])).toEqual({});
    expect(numberMap('nope')).toEqual({});
  });
});

describe('normaliseTop', () => {
  it('orders best first, with the earlier run first between equal scores', () => {
    const table = normaliseTop([
      { score: 50, at: 300 },
      { score: 90, at: 200 },
      { score: 50, at: 100 },
    ]);
    expect(table).toEqual([
      { score: 90, at: 200 },
      { score: 50, at: 100 },
      { score: 50, at: 300 },
    ]);
  });

  it('keeps the highest few', () => {
    const table = normaliseTop([10, 20, 30, 40, 50, 60, 70].map((score, i) => ({ score, at: i + 1 })));
    expect(table).toHaveLength(TOP_SIZE);
    expect(table.map((e) => e.score)).toEqual([70, 60, 50, 40, 30]);
  });

  it('lists the same run once', () => {
    expect(normaliseTop([{ score: 80, at: 5 }, { score: 80, at: 5 }, { score: 80, at: 6 }])).toEqual([
      { score: 80, at: 5 },
      { score: 80, at: 6 },
    ]);
  });

  it('drops entries that are not scores', () => {
    expect(normaliseTop([{ score: 0, at: 1 }, { score: -4, at: 1 }, { score: 'lots', at: 1 }, 'nope', null, { at: 9 }, { score: 7 }])).toEqual([{ score: 7, at: 0 }]);
    expect(normaliseTop({ score: 5 })).toEqual([]);
    expect(normaliseTop(undefined)).toEqual([]);
  });
});
