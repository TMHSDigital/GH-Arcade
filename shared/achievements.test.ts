import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshModules, installMemoryStorage, installWindow } from './test-utils';

afterEach(() => vi.unstubAllGlobals());

async function fresh(initial: Record<string, string> = {}) {
  const storage = installMemoryStorage(initial);
  installWindow();
  const { achievements } = await freshModules();
  return { storage, a: achievements };
}

describe('unlock', () => {
  it('returns false for an unknown id', async () => {
    const { a } = await fresh();
    expect(a.unlock('nope.nothing')).toBe(false);
    expect(a.isUnlocked('nope.nothing')).toBe(false);
  });

  it('returns true once for a known id, and notifies listeners', async () => {
    const { a } = await fresh();
    const fn = vi.fn();
    a.onUnlock(fn);
    expect(a.unlock('snake.bonus')).toBe(true);
    expect(a.unlock('snake.bonus')).toBe(false);
    expect(a.isUnlocked('snake.bonus')).toBe(true);
    expect(a.unlockedAt('snake.bonus')).toBeTypeOf('number');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('grants the collection trophy on the tenth other trophy', async () => {
    const { a } = await fresh();
    const ids = a.TROPHIES.filter((t) => t.game !== 'arcade' && !t.counter).map((t) => t.id);
    ids.slice(0, 9).forEach((id) => a.unlock(id));
    expect(a.isUnlocked('arcade.case')).toBe(false);
    a.unlock(ids[9]);
    expect(a.isUnlocked('arcade.case')).toBe(true);
  });

  it('does not count the collection trophy toward itself', async () => {
    const { a } = await fresh();
    const ids = a.TROPHIES.filter((t) => t.game !== 'arcade' && !t.counter).map((t) => t.id);
    ids.slice(0, 10).forEach((id) => a.unlock(id));
    // Ten others plus the collection trophy: eleven unlocked, and it was granted exactly once.
    expect(a.TROPHIES.filter((t) => a.isUnlocked(t.id))).toHaveLength(11);
  });
});

describe('addCounter', () => {
  it('accumulates and unlocks exactly at the target', async () => {
    const { a } = await fresh();
    expect(a.addCounter('stack.lines', 99)).toBe(99);
    expect(a.isUnlocked('stack.lines')).toBe(false);
    expect(a.addCounter('stack.lines')).toBe(100);
    expect(a.isUnlocked('stack.lines')).toBe(true);
    expect(a.getCounter('stack.lines')).toBe(100);
  });
});

describe('recordPlay', () => {
  it('accumulates plays, best and total score', async () => {
    const { a } = await fresh();
    expect(a.getStats('snake')).toEqual({ plays: 0, best: 0, totalScore: 0 });
    a.recordPlay('snake', 100);
    a.recordPlay('snake', 40);
    a.recordPlay('snake');
    expect(a.getStats('snake')).toMatchObject({ plays: 3, best: 100, totalScore: 140 });
    expect(a.getCounter('arcade.plays')).toBe(3);
  });

  it('stamps the time of the last play and keeps it across a reload', async () => {
    const { a, storage } = await fresh();
    expect(a.getStats('snake').lastPlayed).toBeUndefined();
    const before = Date.now();
    a.recordPlay('snake', 5);
    expect(a.getStats('snake').lastPlayed).toBeGreaterThanOrEqual(before);
    const again = await fresh({ 'gh-arcade:trophies': storage.data.get('gh-arcade:trophies')! });
    expect(again.a.getStats('snake').lastPlayed).toBe(a.getStats('snake').lastPlayed);
  });

  it('unlocks "play every game" only after every game has a play', async () => {
    const { a } = await fresh();
    const games = [...new Set(a.TROPHIES.filter((t) => t.game !== 'arcade').map((t) => t.game))];
    games.slice(0, -1).forEach((g) => a.recordPlay(g, 1));
    expect(a.isUnlocked('arcade.all')).toBe(false);
    a.recordPlay(games[games.length - 1], 1);
    expect(a.isUnlocked('arcade.all')).toBe(true);
  });
});

describe('best scores', () => {
  it('recordPlay reports a record only for a strictly higher score', async () => {
    const { a } = await fresh();
    expect(a.recordPlay('snake', 0)).toBe(false);
    expect(a.recordPlay('snake', 10)).toBe(true);
    expect(a.recordPlay('snake', 10)).toBe(false);
    expect(a.recordPlay('snake', 9)).toBe(false);
    expect(a.recordPlay('snake', 11)).toBe(true);
    expect(a.getHighScore('snake')).toBe(11);
    expect(a.getHighScore('pong')).toBe(0);
  });

  it('adopts legacy per-game keys once, keeping the higher value, and removes them', async () => {
    const trophies = JSON.stringify({ version: 1, games: { snake: { plays: 3, best: 40, totalScore: 90 }, pong: { plays: 1, best: 900, totalScore: 900 } } });
    const { a, storage } = await fresh({
      'gh-arcade:trophies': trophies,
      'gh-arcade:snake:highscore': '75',
      'gh-arcade:pong:highscore': '100',
      'gh-arcade:hop:highscore': '12',
      'gh-arcade:maze:highscore': '"abc"',
    });
    expect(a.getHighScore('snake')).toBe(75);
    expect(a.getHighScore('pong')).toBe(900);
    expect(a.getHighScore('hop')).toBe(12);
    expect(a.getHighScore('maze')).toBe(0);
    expect(a.getStats('snake').plays).toBe(3);
    expect([...storage.data.keys()]).toEqual(['gh-arcade:trophies']);
    expect(JSON.parse(storage.data.get('gh-arcade:trophies')!).games.hop.best).toBe(12);
  });

  it('a best score without a play does not count toward "play every game"', async () => {
    const games = [...new Set((await fresh()).a.TROPHIES.filter((t) => t.game !== 'arcade').map((t) => t.game))];
    const legacy = Object.fromEntries(games.map((g) => [`gh-arcade:${g}:highscore`, '5']));
    const { a } = await fresh(legacy);
    a.recordPlay(games[0], 1);
    expect(a.isUnlocked('arcade.all')).toBe(false);
  });

  it('resetBestScores clears bests and keeps everything else', async () => {
    const { a } = await fresh();
    a.unlock('snake.bonus');
    a.recordPlay('snake', 30);
    a.resetBestScores();
    expect(a.getHighScore('snake')).toBe(0);
    expect(a.getStats('snake').plays).toBe(1);
    expect(a.isUnlocked('snake.bonus')).toBe(true);
  });
});

describe('trophyProgress', () => {
  it('counts a game\'s unlocked trophies out of its total', async () => {
    const { a } = await fresh();
    expect(a.trophyProgress('snake')).toEqual({ unlocked: 0, total: 4 });
    a.unlock('snake.bonus');
    a.unlock('pong.win');
    expect(a.trophyProgress('snake')).toEqual({ unlocked: 1, total: 4 });
    expect(a.trophyProgress('no-such-game')).toEqual({ unlocked: 0, total: 0 });
  });
});

describe('recent unlocks', () => {
  it('drainRecentUnlocks returns new trophies once', async () => {
    const { a } = await fresh();
    a.unlock('snake.bonus');
    a.unlock('pong.win');
    expect(a.drainRecentUnlocks().map((t) => t.id)).toEqual(['snake.bonus', 'pong.win']);
    expect(a.drainRecentUnlocks()).toEqual([]);
  });

  it('clearRecentUnlocks forgets trophies from an abandoned run', async () => {
    const { a } = await fresh();
    a.unlock('snake.bonus');
    a.clearRecentUnlocks();
    expect(a.drainRecentUnlocks()).toEqual([]);
    expect(a.isUnlocked('snake.bonus')).toBe(true);
  });
});

describe('resetTrophies', () => {
  it('clears unlocks, counters, plays and the recent list, but keeps best scores', async () => {
    const { a } = await fresh();
    a.unlock('snake.bonus');
    a.addCounter('stack.lines', 5);
    a.recordPlay('snake', 10);
    a.resetTrophies();
    expect(a.isUnlocked('snake.bonus')).toBe(false);
    expect(a.getCounter('stack.lines')).toBe(0);
    expect(a.getStats('snake')).toMatchObject({ plays: 0, totalScore: 0 });
    expect(a.getHighScore('snake')).toBe(10);
    expect(a.drainRecentUnlocks()).toEqual([]);
  });
});

describe('persistence', () => {
  it('saves under gh-arcade:trophies and reloads it', async () => {
    const { a, storage } = await fresh();
    a.unlock('snake.bonus');
    a.recordPlay('snake', 12);
    const saved = storage.data.get('gh-arcade:trophies')!;
    expect(JSON.parse(saved)).toMatchObject({ version: 1, games: { snake: { plays: 1, best: 12, totalScore: 12 } } });

    const again = await fresh({ 'gh-arcade:trophies': saved });
    expect(again.a.isUnlocked('snake.bonus')).toBe(true);
    expect(again.a.getStats('snake').best).toBe(12);
  });

  it('survives malformed saved data', async () => {
    const bad = JSON.stringify({ unlocked: 'nope', counters: null, games: { snake: 7, pong: { plays: 'a', best: 3 } } });
    const { a } = await fresh({ 'gh-arcade:trophies': bad });
    expect(a.isUnlocked('snake.bonus')).toBe(false);
    expect(a.getCounter('stack.lines')).toBe(0);
    expect(a.getStats('snake')).toEqual({ plays: 0, best: 0, totalScore: 0 });
    expect(a.getStats('pong')).toEqual({ plays: 0, best: 3, totalScore: 0 });
    expect(a.unlock('snake.bonus')).toBe(true);
  });
});
