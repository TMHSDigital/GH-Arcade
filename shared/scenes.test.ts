import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { Trophy } from './achievements';
import { installMemoryStorage, installWindow } from './test-utils';

// scenes.ts only needs the shutdown event name and a Scene base class from Phaser at load time.
vi.mock('phaser', () => {
  class Scene {}
  return { default: { Scene, Scenes: { Events: { SHUTDOWN: 'shutdown' } } } };
});
// The modules that draw or read input are not part of the run lifecycle under test.
vi.mock('./controls', () => ({ ArcadeControls: class {} }));
vi.mock('./menu', () => ({ OptionMenu: class {} }));
vi.mock('./sfx', () => ({ tone: () => undefined }));
vi.mock('./toast', () => ({ showToast: () => undefined }));
vi.mock('./touch', () => ({ isTouchDevice: () => false }));
vi.mock('./ui', () => ({ NEON: {}, blinkingPrompt: () => undefined, fadeToScene: () => undefined, neonText: () => undefined, onStart: () => undefined }));

afterEach(() => vi.unstubAllGlobals());

/** Loads scenes.ts (and the trophies it records to) against clean storage. */
async function fresh() {
  installMemoryStorage();
  installWindow();
  vi.resetModules();
  return import('./scenes');
}

/** A scene with just what endRun and restartDataFor touch, recording what they do. */
function fakeScene(startedWith?: object) {
  const starts: [string, unknown][] = [];
  const delays: number[] = [];
  let shutdown: (() => void) | undefined;
  const scene = {
    sys: { settings: { data: startedWith } },
    events: { once: (_event: string, fn: () => void) => void (shutdown = fn) },
    scene: { start: (key: string, data: unknown) => void starts.push([key, data]) },
    time: {
      delayedCall: (ms: number, fn: () => void) => {
        delays.push(ms);
        fn();
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, starts, delays, shutDown: () => shutdown?.() };
}

describe('finishRun', () => {
  it('counts a play without a score, which cannot be a record', async () => {
    const { finishRun } = await fresh();
    const { getStats } = await import('./achievements');
    expect(finishRun('pong')).toMatchObject({ isRecord: false, rank: 0 });
    expect(getStats('pong').plays).toBe(1);
  });

  it('reports a record and the place in the top scores', async () => {
    const { finishRun } = await fresh();
    expect(finishRun('snake', 100)).toMatchObject({ isRecord: true, rank: 1 });
    expect(finishRun('snake', 50)).toMatchObject({ isRecord: false, rank: 2 });
  });

  it('returns the trophies earned during the run, once', async () => {
    const { finishRun } = await fresh();
    const { unlock } = await import('./achievements');
    unlock('snake.bonus');
    expect(finishRun('snake', 10).earned.map((t) => t.id)).toEqual(['snake.bonus']);
    expect(finishRun('snake', 10).earned).toEqual([]);
  });
});

describe('restartDataFor', () => {
  it('prefers the recorded data, then what the scene was started with, then nothing', async () => {
    const { restartDataFor, setRestartData } = await fresh();
    expect(restartDataFor(fakeScene().scene)).toEqual({});
    const { scene } = fakeScene({ players: 1 });
    expect(restartDataFor(scene)).toEqual({ players: 1 });
    setRestartData(scene, { players: 2 });
    expect(restartDataFor(scene)).toEqual({ players: 2 });
    setRestartData(scene, undefined);
    expect(restartDataFor(scene)).toEqual({ players: 1 });
  });
});

describe('endRun', () => {
  const run = { gameId: 'snake', score: 10 };

  it('starts the game-over screen once per run, and again after the scene shuts down', async () => {
    const { endRun, SCENE } = await fresh();
    const { scene, starts, shutDown } = fakeScene();
    endRun(scene, run);
    endRun(scene, run);
    expect(starts.map(([key]) => key)).toEqual([SCENE.gameOver]);
    shutDown();
    endRun(scene, run);
    expect(starts).toHaveLength(2);
  });

  it('waits for the delay it is given, and not at all without one', async () => {
    const { endRun } = await fresh();
    const delayed = fakeScene();
    endRun(delayed.scene, run, 500);
    expect(delayed.delays).toEqual([500]);
    expect(delayed.starts).toHaveLength(1);

    const immediate = fakeScene();
    endRun(immediate.scene, run);
    expect(immediate.delays).toEqual([]);
    expect(immediate.starts).toHaveLength(1);
  });

  it('restarts with the recorded restart data unless the run names its own', async () => {
    const { endRun, setRestartData } = await fresh();
    const recorded = fakeScene({ daily: false });
    setRestartData(recorded.scene, { daily: true });
    endRun(recorded.scene, run);
    expect(recorded.starts[0][1]).toMatchObject({ restartData: { daily: true } });

    const explicit = fakeScene();
    setRestartData(explicit.scene, { daily: true });
    endRun(explicit.scene, { ...run, restartData: { players: 2 } });
    expect(explicit.starts[0][1]).toMatchObject({ restartData: { players: 2 } });
  });
});

describe('trophyLine', () => {
  const trophies = (...titles: string[]) => titles.map((title) => ({ title }) as Trophy);

  it('names up to two trophies and counts the rest', async () => {
    const { trophyLine } = await fresh();
    expect(trophyLine(trophies('First'))).toBe('TROPHY: FIRST');
    expect(trophyLine(trophies('First', 'Second'))).toBe('TROPHY: FIRST, SECOND');
    expect(trophyLine(trophies('First', 'Second', 'Third'))).toBe('TROPHY: FIRST, SECOND +1 MORE');
  });
});
