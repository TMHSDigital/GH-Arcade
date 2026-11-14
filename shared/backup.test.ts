import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportBackup, importBackup, mergeBackup } from './backup';
import { freshModules, installMemoryStorage, installWindow } from './test-utils';

afterEach(() => vi.unstubAllGlobals());

const saved = {
  'gh-arcade:settings': JSON.stringify({ version: 1, volume: 0.4, palette: 'colorblind' }),
  'gh-arcade:trophies': JSON.stringify({ version: 1, unlocked: { 'snake.bonus': 123 }, counters: {}, games: { snake: { plays: 2, best: 50, totalScore: 80 } } }),
  'gh-arcade:snake:highscore': '50',
  'gh-arcade:space-dodge:highscore': '7',
  'gh-arcade:hub:sort': '"recent"',
  'gh-arcade:stack:daily:2026-11-12': '1200',
  'unrelated:key': '"left alone"',
};

describe('exportBackup', () => {
  it('collects every arcade key without the prefix and nothing else', () => {
    installMemoryStorage(saved);
    const backup = exportBackup();
    expect(backup.app).toBe('gh-arcade');
    expect(backup.version).toBe(1);
    expect(Object.keys(backup.data).sort()).toEqual(['hub:sort', 'settings', 'snake:highscore', 'space-dodge:highscore', 'stack:daily:2026-11-12', 'trophies']);
    expect(backup.data['snake:highscore']).toBe(50);
    expect(Number.isNaN(Date.parse(backup.exportedAt))).toBe(false);
  });

  it('returns an empty backup when storage is unavailable', () => {
    expect(exportBackup().data).toEqual({});
  });
});

describe('importBackup', () => {
  it('restores an export on a clean profile', async () => {
    installMemoryStorage(saved);
    const backup = JSON.parse(JSON.stringify(exportBackup()));

    const clean = installMemoryStorage();
    installWindow();
    expect(importBackup(backup)).toEqual({ ok: true, keys: 6 });
    expect(clean.data.get('gh-arcade:stack:daily:2026-11-12')).toBe('1200');
    expect(clean.data.get('gh-arcade:snake:highscore')).toBe('50');

    const { settings, achievements } = await freshModules();
    expect(settings.getSettings()).toMatchObject({ volume: 0.4, palette: 'colorblind' });
    expect(achievements.isUnlocked('snake.bonus')).toBe(true);
    expect(achievements.getStats('snake')).toMatchObject({ plays: 2, best: 50 });
    // A backup from before best scores moved into the stats still restores them.
    expect(achievements.getHighScore('space-dodge')).toBe(7);
  });

  it('replaces what was there, but leaves other sites\' keys alone', () => {
    const storage = installMemoryStorage({ 'gh-arcade:pong:highscore': '900', 'unrelated:key': '"left alone"' });
    importBackup({ app: 'gh-arcade', version: 1, data: { 'snake:highscore': 5 } });
    expect(storage.data.has('gh-arcade:pong:highscore')).toBe(false);
    expect(storage.data.get('gh-arcade:snake:highscore')).toBe('5');
    expect(storage.data.get('unrelated:key')).toBe('"left alone"');
  });

  it.each([
    ['not an object', 'nope'],
    ['an array', [1, 2]],
    ['another app', { app: 'other', version: 1, data: {} }],
    ['missing data', { app: 'gh-arcade', version: 1 }],
    ['a newer version', { app: 'gh-arcade', version: 99, data: {} }],
    ['a bad score', { app: 'gh-arcade', version: 1, data: { 'snake:highscore': 'lots' } }],
    ['a negative score', { app: 'gh-arcade', version: 1, data: { 'snake:highscore': -1 } }],
    ['settings that are not an object', { app: 'gh-arcade', version: 1, data: { settings: [1] } }],
    ['an unknown key', { app: 'gh-arcade', version: 1, data: { 'snake:highscore': 5, surprise: true } }],
    ['a malformed daily key', { app: 'gh-arcade', version: 1, data: { 'stack:daily:tomorrow': 5 } }],
  ])('rejects %s without changing stored data', (_name, file) => {
    const storage = installMemoryStorage(saved);
    const before = new Map(storage.data);
    const result = importBackup(file);
    expect(result.ok).toBe(false);
    expect(storage.data).toEqual(before);
  });
});

describe('the hub tag filter in a backup', () => {
  it('round-trips a chosen tag and "All"', () => {
    for (const tag of ['"2-player"', 'null']) {
      const storage = installMemoryStorage({ 'gh-arcade:hub:tag': tag });
      const backup = JSON.parse(JSON.stringify(exportBackup()));
      storage.clear();
      expect(importBackup(backup)).toEqual({ ok: true, keys: 1 });
      expect(storage.data.get('gh-arcade:hub:tag')).toBe(tag);
    }
  });

  it('rejects a tag that is not text', () => {
    installMemoryStorage();
    const result = importBackup({ app: 'gh-arcade', version: 1, data: { 'hub:tag': 7 } });
    expect(result.ok).toBe(false);
  });
});

describe('mergeBackup', () => {
  const file = (data: Record<string, unknown>) => ({ app: 'gh-arcade', version: 1, data });
  const trophies = (storage: { data: Map<string, string> }) => JSON.parse(storage.data.get('gh-arcade:trophies')!);

  const here = {
    version: 1,
    unlocked: { 'snake.bonus': 500, 'stack.lines': 900 },
    counters: { 'arcade.plays': 12, 'stack.lines': 40 },
    games: { snake: { plays: 8, best: 300, totalScore: 900, lastPlayed: 2000 }, pong: { plays: 3, best: 0, totalScore: 0 } },
    top: { snake: [{ score: 300, at: 2000 }, { score: 100, at: 1500 }] },
  };
  const there = {
    version: 1,
    unlocked: { 'snake.bonus': 200, 'runner.coins': 700 },
    counters: { 'arcade.plays': 5, 'runner.coins': 60 },
    games: { snake: { plays: 2, best: 450, totalScore: 600, lastPlayed: 1000 }, runner: { plays: 4, best: 80, totalScore: 200, lastPlayed: 3000 } },
    top: { snake: [{ score: 450, at: 1000 }, { score: 100, at: 1500 }], runner: [{ score: 80, at: 3000 }] },
  };

  it('keeps every trophy, with the earlier unlock date', () => {
    const storage = installMemoryStorage({ 'gh-arcade:trophies': JSON.stringify(here) });
    expect(mergeBackup(file({ trophies: there })).ok).toBe(true);
    expect(trophies(storage).unlocked).toEqual({ 'snake.bonus': 200, 'stack.lines': 900, 'runner.coins': 700 });
  });

  it('takes the higher value for bests, plays, totals, counters and last played', () => {
    const storage = installMemoryStorage({ 'gh-arcade:trophies': JSON.stringify(here) });
    mergeBackup(file({ trophies: there }));
    const merged = trophies(storage);
    expect(merged.games.snake).toEqual({ plays: 8, best: 450, totalScore: 900, lastPlayed: 2000 });
    expect(merged.games.runner).toEqual({ plays: 4, best: 80, totalScore: 200, lastPlayed: 3000 });
    expect(merged.games.pong).toEqual({ plays: 3, best: 0, totalScore: 0 });
    expect(merged.counters).toEqual({ 'arcade.plays': 12, 'stack.lines': 40, 'runner.coins': 60 });
  });

  it('combines the score tables and lists a run that is in both once', () => {
    const storage = installMemoryStorage({ 'gh-arcade:trophies': JSON.stringify(here) });
    mergeBackup(file({ trophies: there }));
    expect(trophies(storage).top).toEqual({
      snake: [{ score: 450, at: 1000 }, { score: 300, at: 2000 }, { score: 100, at: 1500 }],
      runner: [{ score: 80, at: 3000 }],
    });
  });

  it('keeps a score table to five entries', () => {
    const table = (scores: number[]) => ({ top: { snake: scores.map((score, i) => ({ score, at: i + 1 })) } });
    const storage = installMemoryStorage({ 'gh-arcade:trophies': JSON.stringify(table([90, 70, 50, 30])) });
    mergeBackup(file({ trophies: table([80, 60, 40, 20]) }));
    expect(trophies(storage).top.snake.map((e: { score: number }) => e.score)).toEqual([90, 80, 70, 60, 50]);
  });

  it('gives the same result when the same backup is merged twice', () => {
    const storage = installMemoryStorage({ 'gh-arcade:trophies': JSON.stringify(here), 'gh-arcade:stack:daily:2026-11-12': '700' });
    const backup = file({ trophies: there, 'stack:daily:2026-11-12': 900, 'stack:daily:2026-11-13': 100 });
    mergeBackup(backup);
    const once = new Map(storage.data);
    expect(mergeBackup(backup)).toEqual({ ok: true, keys: 0 });
    expect(storage.data).toEqual(once);
  });

  it('never lowers a best score or removes a trophy', () => {
    const storage = installMemoryStorage({ 'gh-arcade:trophies': JSON.stringify(here) });
    mergeBackup(file({ trophies: { unlocked: {}, counters: {}, games: { snake: { plays: 1, best: 5, totalScore: 5 } } } }));
    const merged = trophies(storage);
    expect(merged.games.snake.best).toBe(300);
    expect(Object.keys(merged.unlocked).sort()).toEqual(['snake.bonus', 'stack.lines']);
  });

  it('takes the higher daily and older per-game best scores', () => {
    const storage = installMemoryStorage({ 'gh-arcade:stack:daily:2026-11-12': '700', 'gh-arcade:snake:highscore': '50' });
    mergeBackup(file({ 'stack:daily:2026-11-12': 400, 'stack:daily:2026-11-13': 100, 'snake:highscore': 80 }));
    expect(storage.data.get('gh-arcade:stack:daily:2026-11-12')).toBe('700');
    expect(storage.data.get('gh-arcade:stack:daily:2026-11-13')).toBe('100');
    expect(storage.data.get('gh-arcade:snake:highscore')).toBe('80');
  });

  it('leaves this device\'s settings and hub preferences alone, and fills in ones it does not have', () => {
    const storage = installMemoryStorage({ 'gh-arcade:settings': JSON.stringify({ version: 1, volume: 0.2 }) });
    mergeBackup(file({ settings: { version: 1, volume: 0.9, muted: true }, 'hub:sort': 'recent' }));
    expect(JSON.parse(storage.data.get('gh-arcade:settings')!)).toEqual({ version: 1, volume: 0.2 });
    expect(storage.data.get('gh-arcade:hub:sort')).toBe('"recent"');
  });

  it('works on a device with nothing saved, and the result loads', async () => {
    installMemoryStorage(saved);
    const backup = JSON.parse(JSON.stringify(exportBackup()));
    installMemoryStorage();
    installWindow();
    expect(mergeBackup(backup).ok).toBe(true);
    const { settings, achievements } = await freshModules();
    expect(settings.getSettings()).toMatchObject({ volume: 0.4, palette: 'colorblind' });
    expect(achievements.isUnlocked('snake.bonus')).toBe(true);
    expect(achievements.getStats('snake')).toMatchObject({ plays: 2, best: 50 });
  });

  it('copes with unreadable or oddly shaped data on this device', () => {
    const storage = installMemoryStorage({ 'gh-arcade:trophies': '{not json', 'gh-arcade:stack:daily:2026-11-12': '"lots"' });
    expect(mergeBackup(file({ trophies: there, 'stack:daily:2026-11-12': 400 })).ok).toBe(true);
    expect(trophies(storage).games.snake.best).toBe(450);
    expect(storage.data.get('gh-arcade:stack:daily:2026-11-12')).toBe('400');
  });

  it('rejects a bad file without changing stored data', () => {
    const storage = installMemoryStorage(saved);
    const before = new Map(storage.data);
    expect(mergeBackup({ app: 'other', version: 1, data: {} }).ok).toBe(false);
    expect(mergeBackup(file({ trophies: there, surprise: true })).ok).toBe(false);
    expect(storage.data).toEqual(before);
  });
});
