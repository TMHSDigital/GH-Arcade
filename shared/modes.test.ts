import { describe, expect, it } from 'vitest';
import { linkedDay, modeIndex, modeQuery, modeSlug } from './modes';

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

describe('a link to a daily challenge day', () => {
  const TODAY = '2026-11-15';

  it('names the day after the mode', () => {
    expect(modeQuery('DAILY', '2026-11-13')).toBe('?mode=daily&day=2026-11-13');
    expect(modeQuery('DAILY')).toBe('?mode=daily');
  });

  it('accepts today and the days inside the keep window', () => {
    expect(linkedDay('?mode=daily&day=2026-11-15', TODAY, 60)).toBe('2026-11-15');
    expect(linkedDay('?mode=daily&day=2026-11-13', TODAY, 60)).toBe('2026-11-13');
    expect(linkedDay('?day=2026-09-17', TODAY, 60)).toBe('2026-09-17');
    expect(linkedDay('?day=2026-10-31&utm_source=x', TODAY, 60)).toBe('2026-10-31');
  });

  it('refuses days that are too old or still to come', () => {
    expect(linkedDay('?day=2026-09-16', TODAY, 60)).toBeNull();
    expect(linkedDay('?day=2025-11-15', TODAY, 60)).toBeNull();
    expect(linkedDay('?day=2026-11-16', TODAY, 60)).toBeNull();
  });

  it.each(['', '?mode=daily', '?day=', '?day=yesterday', '?day=2026-13-01', '?day=2026-02-31', '?day=2026-11-13T00:00', '?day=20261113'])(
    'asks for no day in "%s"',
    (search) => {
      expect(linkedDay(search, TODAY, 60)).toBeNull();
    },
  );
});
