import { describe, expect, it } from 'vitest';
import {
  catchPoints,
  type ChaserCore,
  chaserSpeed,
  chooseDirection,
  directionOptions,
  isScatter,
  runnerSpeed,
  scaredSeconds,
  targetFor,
  touches,
} from './chase';
import {
  CHASER_SPEED,
  CHASER_SPEED_MAX,
  COLS,
  EYES_SPEED,
  HOUSE_SPEED,
  MODE_SCHEDULE,
  POINTS_CHASER,
  RUNNER_SPEED,
  RUNNER_SPEED_MAX,
  SCARED_SPEED,
  SCARED_TIME,
  SCARED_TIME_MIN,
  TUNNEL_SPEED,
} from './config';
import { HOUSE_EXIT, open, TUNNEL_ROW, VEC } from './maze';

const chaser = (over: Partial<ChaserCore> = {}): ChaserCore => ({
  kind: 'hunter',
  state: 'active',
  scared: false,
  x: 5,
  y: 1,
  dir: 'left',
  corner: { x: 0, y: -2 },
  ...over,
});

describe('speeds', () => {
  it('the runner speeds up with the level, to a cap', () => {
    expect(runnerSpeed(1)).toBe(RUNNER_SPEED);
    expect(runnerSpeed(2)).toBeGreaterThan(runnerSpeed(1));
    expect(runnerSpeed(99)).toBe(RUNNER_SPEED_MAX);
  });

  it('a chaser out in the maze speeds up with the level, to a cap', () => {
    expect(chaserSpeed(chaser(), 1)).toBe(CHASER_SPEED);
    expect(chaserSpeed(chaser(), 3)).toBeGreaterThan(CHASER_SPEED);
    expect(chaserSpeed(chaser(), 99)).toBe(CHASER_SPEED_MAX);
  });

  it('eyes hurry home and chasers in the house crawl', () => {
    expect(chaserSpeed(chaser({ state: 'eyes' }), 1)).toBe(EYES_SPEED);
    expect(chaserSpeed(chaser({ state: 'entering' }), 1)).toBe(EYES_SPEED);
    expect(chaserSpeed(chaser({ state: 'house' }), 5)).toBe(HOUSE_SPEED);
    expect(chaserSpeed(chaser({ state: 'leaving' }), 5)).toBe(HOUSE_SPEED);
  });

  it('chasers slow down in the tunnel and when scared', () => {
    expect(chaserSpeed(chaser({ x: 2, y: TUNNEL_ROW }), 4)).toBe(TUNNEL_SPEED);
    expect(chaserSpeed(chaser({ x: COLS - 3, y: TUNNEL_ROW }), 4)).toBe(TUNNEL_SPEED);
    expect(chaserSpeed(chaser({ x: 8, y: TUNNEL_ROW }), 1)).toBe(CHASER_SPEED);
    expect(chaserSpeed(chaser({ scared: true }), 4)).toBe(SCARED_SPEED);
  });

  it('the tunnel slowdown applies even to a scared chaser, and eyes ignore both', () => {
    expect(chaserSpeed(chaser({ x: 2, y: TUNNEL_ROW, scared: true }), 1)).toBe(TUNNEL_SPEED);
    expect(chaserSpeed(chaser({ x: 2, y: TUNNEL_ROW, state: 'eyes' }), 1)).toBe(EYES_SPEED);
  });

  it('the runner starts out faster than the chasers', () => {
    expect(runnerSpeed(1)).toBeGreaterThan(chaserSpeed(chaser(), 1));
  });
});

describe('scares', () => {
  it('last a shorter time each level, down to a floor', () => {
    expect(scaredSeconds(1)).toBe(SCARED_TIME);
    expect(scaredSeconds(2)).toBeLessThan(SCARED_TIME);
    expect(scaredSeconds(99)).toBe(SCARED_TIME_MIN);
  });

  it('catching chasers on one power cell doubles each time', () => {
    expect([0, 1, 2, 3].map(catchPoints)).toEqual([POINTS_CHASER, POINTS_CHASER * 2, POINTS_CHASER * 4, POINTS_CHASER * 8]);
  });
});

describe('scatter and chase phases', () => {
  it('alternate, starting with scatter', () => {
    expect(isScatter(0)).toBe(true);
    expect(isScatter(1)).toBe(false);
    expect(isScatter(2)).toBe(true);
  });

  it('end in a permanent chase once the schedule runs out', () => {
    expect(isScatter(MODE_SCHEDULE.length)).toBe(false);
    expect(isScatter(MODE_SCHEDULE.length + 1)).toBe(false);
  });
});

describe('targetFor', () => {
  const ctx = { runner: { x: 10, y: 5 }, facing: 'left' as const, hunter: { x: 14, y: 5 }, scatter: false };

  it('eyes always head for the house exit', () => {
    expect(targetFor(chaser({ state: 'eyes' }), { ...ctx, scatter: true })).toEqual(HOUSE_EXIT);
  });

  it('everyone heads for their own corner in a scatter phase', () => {
    for (const kind of ['hunter', 'ambusher', 'flanker', 'drifter'] as const) {
      expect(targetFor(chaser({ kind, corner: { x: 3, y: 9 } }), { ...ctx, scatter: true })).toEqual({ x: 3, y: 9 });
    }
  });

  it('the hunter targets the runner', () => {
    expect(targetFor(chaser({ kind: 'hunter' }), ctx)).toEqual({ x: 10, y: 5 });
  });

  it('the ambusher targets four cells ahead of the runner', () => {
    expect(targetFor(chaser({ kind: 'ambusher' }), ctx)).toEqual({ x: 6, y: 5 });
    expect(targetFor(chaser({ kind: 'ambusher' }), { ...ctx, facing: 'down' })).toEqual({ x: 10, y: 9 });
  });

  it('the flanker mirrors the hunter through a point two cells ahead of the runner', () => {
    // Pivot is (8, 5); the hunter at (14, 5) mirrors to (2, 5).
    expect(targetFor(chaser({ kind: 'flanker' }), ctx)).toEqual({ x: 2, y: 5 });
  });

  it('the drifter chases from afar and retreats when close', () => {
    const corner = { x: 0, y: 22 };
    expect(targetFor(chaser({ kind: 'drifter', x: 20, y: 5, corner }), ctx)).toEqual(ctx.runner);
    expect(targetFor(chaser({ kind: 'drifter', x: 12, y: 5, corner }), ctx)).toEqual(corner);
  });
});

describe('choosing a direction', () => {
  it('offers open neighbours but never a reversal', () => {
    // (1, 1) is the top-left corner of the maze: open to the right and down only.
    expect(open(2, 1) && open(1, 2) && !open(0, 1) && !open(1, 0)).toBe(true);
    expect(directionOptions({ x: 1, y: 1, dir: 'left' }).sort()).toEqual(['down']);
    expect(directionOptions({ x: 1, y: 1, dir: 'up' }).sort()).toEqual(['right']);
    expect(directionOptions({ x: 1, y: 1, dir: null }).sort()).toEqual(['down', 'right']);
  });

  it('only ever offers open cells', () => {
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      for (const d of directionOptions({ x: 5, y: 3, dir })) expect(open(5 + VEC[d].x, 3 + VEC[d].y)).toBe(true);
    }
  });

  it('picks the option that ends up closest to the target', () => {
    expect(chooseDirection({ x: 5, y: 5 }, { x: 20, y: 5 }, ['up', 'left', 'down', 'right'])).toBe('right');
    expect(chooseDirection({ x: 5, y: 5 }, { x: 5, y: 0 }, ['left', 'down', 'up'])).toBe('up');
  });

  it('takes the best remaining option when the direct way is not offered', () => {
    // Target is to the right, but only up and left are possible: up keeps it closer.
    expect(chooseDirection({ x: 5, y: 5 }, { x: 20, y: 5 }, ['up', 'left'])).toBe('up');
  });

  it('breaks ties in favour of the earlier option', () => {
    expect(chooseDirection({ x: 5, y: 5 }, { x: 5, y: 5 }, ['down', 'right'])).toBe('down');
    expect(chooseDirection({ x: 5, y: 5 }, { x: 5, y: 5 }, ['right', 'down'])).toBe('right');
  });
});

describe('touches', () => {
  const runner = { x: 10, y: 5 };

  it('is true when overlapping and false a full cell apart', () => {
    expect(touches({ x: 10.5, y: 5 }, runner)).toBe(true);
    expect(touches({ x: 10, y: 5.59 }, runner)).toBe(true);
    expect(touches({ x: 10.75, y: 5 }, runner)).toBe(false);
    expect(touches({ x: 11, y: 5 }, runner)).toBe(false);
    expect(touches({ x: 10, y: 6 }, runner)).toBe(false);
  });

  it('counts across the tunnel wrap', () => {
    expect(touches({ x: COLS - 0.3, y: TUNNEL_ROW }, { x: 0, y: TUNNEL_ROW })).toBe(true);
    expect(touches({ x: COLS - 2, y: TUNNEL_ROW }, { x: 0, y: TUNNEL_ROW })).toBe(false);
  });
});
