import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportBackup, importBackup } from './backup';
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
