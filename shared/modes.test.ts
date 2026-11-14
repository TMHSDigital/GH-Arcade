import { describe, expect, it } from 'vitest';
import { modeIndex, modeQuery, modeSlug } from './modes';

const LABELS = ['NORMAL', 'DAILY'];

describe('modeSlug', () => {
  it('lower-cases a label and joins its words with dashes', () => {
    expect(modeSlug('DAILY')).toBe('daily');
    expect(modeSlug('2 PLAYERS')).toBe('2-players');
    expect(modeSlug('  Co-op!  ')).toBe('co-op');
  });
});

describe('modeQuery', () => {
  it('builds the query string for a mode', () => {
    expect(modeQuery('DAILY')).toBe('?mode=daily');
    expect(modeQuery('2 PLAYERS')).toBe('?mode=2-players');
  });
});

describe('modeIndex', () => {
  it('finds the mode a link names, whatever its case', () => {
    expect(modeIndex(LABELS, '?mode=daily')).toBe(1);
    expect(modeIndex(LABELS, '?mode=DAILY')).toBe(1);
    expect(modeIndex(['1 PLAYER', '2 PLAYERS'], '?mode=2-players')).toBe(1);
  });

  it('round-trips with modeQuery', () => {
    for (const [i, label] of LABELS.entries()) expect(modeIndex(LABELS, modeQuery(label))).toBe(i);
  });

  it('falls back to the first mode for a missing, empty or unknown mode', () => {
    expect(modeIndex(LABELS, '')).toBe(0);
    expect(modeIndex(LABELS, '?mode=')).toBe(0);
    expect(modeIndex(LABELS, '?mode=turbo')).toBe(0);
    expect(modeIndex(LABELS, '?other=daily')).toBe(0);
  });

  it('ignores other parameters beside the mode', () => {
    expect(modeIndex(LABELS, '?utm_source=x&mode=daily')).toBe(1);
  });
});
