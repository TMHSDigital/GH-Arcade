import { afterEach, describe, expect, it, vi } from 'vitest';
import registry from '../games/registry.json';
import type { TROPHIES as STACK_TROPHIES } from '../games/stack/trophies';
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

describe('counter persistence', () => {
  it('does not write to storage on every increment', async () => {
    const { a, storage } = await fresh();
    for (let i = 0; i < 6; i++) a.addCounter('runner.coins');
    expect(storage.data.has('gh-arcade:trophies')).toBe(false);
    expect(a.getCounter('runner.coins')).toBe(6);
  });

  it('writes the counters when the run is recorded', async () => {
    const { a, storage } = await fresh();
    a.addCounter('runner.coins', 6);
    a.recordPlay('runner', 150);
    expect(JSON.parse(storage.data.get('gh-arcade:trophies')!).counters['runner.coins']).toBe(6);
  });

  it('writes the counters when one of them unlocks a trophy', async () => {
    const { a, storage } = await fresh();
    a.addCounter('stack.lines', 100);
    expect(JSON.parse(storage.data.get('gh-arcade:trophies')!).counters['stack.lines']).toBe(100);
  });

  it('writes unsaved counters when the page is hidden, so closing the tab mid-run keeps them', async () => {
    const storage = installMemoryStorage();
    const handlers: Record<string, () => void> = {};
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), addEventListener: (type: string, fn: () => void) => (handlers[type] = fn) });
    vi.stubGlobal('document', { visibilityState: 'hidden', addEventListener: (type: string, fn: () => void) => (handlers[type] = fn) });
    const { achievements: a } = await freshModules();
    a.addCounter('runner.coins', 4);
    expect(storage.data.has('gh-arcade:trophies')).toBe(false);
    handlers.visibilitychange();
    expect(JSON.parse(storage.data.get('gh-arcade:trophies')!).counters['runner.coins']).toBe(4);
    a.addCounter('runner.coins', 1);
    handlers.pagehide();
    expect(JSON.parse(storage.data.get('gh-arcade:trophies')!).counters['runner.coins']).toBe(5);
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
    const games = (registry as { slug: string }[]).map((g) => g.slug);
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
    const games = (registry as { slug: string }[]).map((g) => g.slug);
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

describe('trophiesFor', () => {
  it('gives a game unlock and addCounter helpers limited to its own ids and counters', async () => {
    const { a } = await fresh();
    const { unlock, addCounter } = a.trophiesFor<typeof STACK_TROPHIES>();
    expect(unlock('stack.quad')).toBe(true);
    expect(addCounter('stack.lines', 3)).toBe(3);
    // The next two lines are type errors, which is the point: a typo cannot compile. If the typing is
    // ever loosened, tsc reports these directives as unused and the build fails.
    // @ts-expect-error not one of Stack's trophy ids
    expect(unlock('stack.qaud')).toBe(false);
    // @ts-expect-error not one of Stack's counters
    addCounter('stack.line');
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

describe('reach', () => {
  it('unlocks only once the value reaches the trophy threshold', async () => {
    const { a } = await fresh();
    expect(a.reach('snake.score', 999)).toBe(false);
    expect(a.isUnlocked('snake.score')).toBe(false);
    expect(a.reach('snake.score', 1000)).toBe(true);
    expect(a.isUnlocked('snake.score')).toBe(true);
    // Already unlocked: nothing new to report.
    expect(a.reach('snake.score', 5000)).toBe(false);
  });

  it('never unlocks a trophy that declares no threshold', async () => {
    const { a } = await fresh();
    expect(a.reach('snake.bonus', 1_000_000)).toBe(false);
    expect(a.isUnlocked('snake.bonus')).toBe(false);
  });

  it('every threshold and target is the number its description names', async () => {
    const { a } = await fresh();
    const numbered = a.TROPHIES.filter((t) => t.threshold !== undefined || t.target !== undefined);
    expect(numbered.length).toBeGreaterThan(20);
    for (const t of numbered) {
      const n = (t.threshold ?? t.target)!;
      const named = (t.description.match(/\d[\d,]*/g) ?? []).map((s) => Number(s.replaceAll(',', '')));
      expect(named, `${t.id}: "${t.description}"`).toContain(n);
    }
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

describe('top scores', () => {
  const scores = (a: { getTopScores: (game: string) => { score: number }[] }, game = 'snake') => a.getTopScores(game).map((e) => e.score);

  it('keeps the five highest scores, best first, with the time of each run', async () => {
    const { a } = await fresh();
    for (const score of [30, 80, 10, 50, 70, 20, 60]) a.recordPlay('snake', score);
    expect(scores(a)).toEqual([80, 70, 60, 50, 30]);
    for (const entry of a.getTopScores('snake')) expect(entry.at).toBeGreaterThan(0);
    expect(a.getHighScore('snake')).toBe(80);
  });

  it('reports where a run landed in the table', async () => {
    const { a } = await fresh();
    expect(a.recordRun('snake', 50)).toEqual({ isRecord: true, rank: 1 });
    expect(a.recordRun('snake', 20)).toEqual({ isRecord: false, rank: 2 });
    expect(a.recordRun('snake', 30)).toEqual({ isRecord: false, rank: 2 });
    expect(a.recordRun('snake', 90)).toEqual({ isRecord: true, rank: 1 });
    // A tie ranks below the run that got there first.
    expect(a.recordRun('snake', 90)).toEqual({ isRecord: false, rank: 2 });
    expect(scores(a)).toEqual([90, 90, 50, 30, 20]);
  });

  it('leaves out a run that does not make the table, a tie for last place included', async () => {
    const { a } = await fresh();
    for (const score of [50, 40, 30, 20, 10]) a.recordPlay('snake', score);
    expect(a.recordRun('snake', 5)).toEqual({ isRecord: false, rank: 0 });
    expect(a.recordRun('snake', 10)).toEqual({ isRecord: false, rank: 0 });
    expect(scores(a)).toEqual([50, 40, 30, 20, 10]);
  });

  it('never lists a play without a score', async () => {
    const { a } = await fresh();
    expect(a.recordRun('pong')).toEqual({ isRecord: false, rank: 0 });
    expect(a.recordRun('pong', 0)).toEqual({ isRecord: false, rank: 0 });
    expect(a.getTopScores('pong')).toEqual([]);
  });

  it('keeps a table per game', async () => {
    const { a } = await fresh();
    a.recordPlay('snake', 10);
    a.recordPlay('runner', 99);
    expect(scores(a, 'snake')).toEqual([10]);
    expect(scores(a, 'runner')).toEqual([99]);
  });

  it('heads the table with a best score saved before the table existed', async () => {
    const { a } = await fresh({ 'gh-arcade:trophies': JSON.stringify({ games: { snake: { plays: 4, best: 120, totalScore: 300 } } }) });
    expect(a.getTopScores('snake')).toEqual([{ score: 120, at: 0 }]);
    expect(a.recordRun('snake', 70)).toEqual({ isRecord: false, rank: 2 });
    expect(a.recordRun('snake', 150)).toEqual({ isRecord: true, rank: 1 });
    expect(scores(a)).toEqual([150, 120, 70]);
  });

  it('survives a reload', async () => {
    const { a, storage } = await fresh();
    for (const score of [30, 80, 10]) a.recordPlay('snake', score);
    const again = await fresh(Object.fromEntries(storage.data));
    expect(scores(again.a)).toEqual([80, 30, 10]);
  });

  it('ignores malformed entries in saved data', async () => {
    const top = { snake: [{ score: 40, at: 5 }, { score: 'x' }, null, { score: -3 }, { score: 90 }], runner: 'nope', hop: [1, 2] };
    const { a } = await fresh({ 'gh-arcade:trophies': JSON.stringify({ top }) });
    expect(a.getTopScores('snake')).toEqual([{ score: 90, at: 0 }, { score: 40, at: 5 }]);
    expect(a.getTopScores('runner')).toEqual([]);
    expect(a.getTopScores('hop')).toEqual([]);
  });

  it('is cleared with the best scores and kept through a trophy reset', async () => {
    const { a } = await fresh();
    for (const score of [30, 80]) a.recordPlay('snake', score);
    a.resetTrophies();
    expect(scores(a)).toEqual([80, 30]);
    a.resetBestScores();
    expect(a.getTopScores('snake')).toEqual([]);
    expect(a.getHighScore('snake')).toBe(0);
  });
});
