import { describe, expect, it } from 'vitest';
import { dailyRng } from '../../shared/rng';
import { CELL, COLS, DOCK_COLS, DOCK_WIDTH, LANES, POINTS_DOCK, POINTS_ORB, POINTS_PER_SECOND_LEFT, SPEED_PER_LEVEL, START_COL, START_ROW } from './config';
import {
  buildLanes,
  columnAt,
  columnX,
  dockAt,
  dockCentre,
  dockPoints,
  freeDocks,
  GRID_W,
  hazardAt,
  hopTarget,
  itemUnder,
  type Lane,
  LOOP,
  moveLanes,
  ORB_WAIT_MS,
  orbWait,
  submerged,
  sweptAway,
  WRAP_MARGIN,
} from './rules';

/** A repeatable stand-in for Math.random. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const lane = (kind: Lane['kind'], item: string | undefined, speed: number, items: Lane['items']): Lane => ({ row: 1, kind, item, speed, items });

describe('hop grid', () => {
  it('hops one cell in each direction from the start', () => {
    const px = columnX(START_COL);
    expect(hopTarget(px, START_ROW, 'up')).toEqual({ px, row: START_ROW - 1 });
    expect(hopTarget(px, START_ROW, 'left')).toEqual({ px: px - CELL, row: START_ROW });
    expect(hopTarget(px, START_ROW, 'right')).toEqual({ px: px + CELL, row: START_ROW });
  });

  it('cannot hop off the bottom or past the top row', () => {
    expect(hopTarget(columnX(3), START_ROW, 'down')).toBeNull();
    expect(hopTarget(columnX(3), 0, 'up')).toBeNull();
    expect(hopTarget(columnX(3), 1, 'up')).toEqual({ px: columnX(3), row: 0 });
  });

  it('stays in the edge column when hopping sideways into a wall', () => {
    expect(hopTarget(columnX(0), 5, 'left')).toEqual({ px: columnX(0), row: 5 });
    expect(hopTarget(columnX(COLS - 1), 5, 'right')).toEqual({ px: columnX(COLS - 1), row: 5 });
  });

  it('snaps to the nearest column after drifting on a ride', () => {
    const drifted = columnX(4) + CELL * 0.4;
    expect(columnAt(drifted)).toBe(4);
    expect(hopTarget(drifted, 3, 'up')).toEqual({ px: columnX(4), row: 2 });
    expect(hopTarget(columnX(4) + CELL * 0.6, 3, 'up')).toEqual({ px: columnX(5), row: 2 });
  });
});

describe('lanes', () => {
  it('lays out every lane with its items evenly spaced around the loop', () => {
    const lanes = buildLanes(1, sequence(0));
    expect(lanes).toHaveLength(LANES.length);
    lanes.forEach((l, row) => {
      const spec = LANES[row];
      expect(l.row).toBe(row);
      expect(l.kind).toBe(spec.kind);
      expect(l.items).toHaveLength(spec.count ?? 0);
      expect(l.speed).toBe(spec.speed ?? 0);
      for (const it of l.items) expect(it.w).toBe(spec.length! * CELL);
      for (let i = 1; i < l.items.length; i++) expect(l.items[i].x - l.items[i - 1].x).toBeCloseTo(LOOP / spec.count!);
    });
  });

  it('never overlaps two items in a lane, whatever the offset', () => {
    for (const r of [0, 0.37, 0.999]) {
      for (const l of buildLanes(1, sequence(r))) {
        for (let i = 1; i < l.items.length; i++) expect(l.items[i].x, `row ${l.row}`).toBeGreaterThanOrEqual(l.items[i - 1].x + l.items[i - 1].w);
      }
    }
  });

  it('speeds up every level', () => {
    const river = buildLanes(3, sequence(0))[1];
    expect(river.speed).toBeCloseTo(LANES[1].speed! * (1 + 2 * SPEED_PER_LEVEL));
  });

  it('moves items by their lane speed', () => {
    const l = lane('road', 'car', -80, [{ x: 200, w: CELL, phase: 0 }]);
    moveLanes([l], 0.5);
    expect(l.items[0].x).toBe(160);
  });

  it('wraps an item only once it is completely off screen, to completely off the other side', () => {
    const right = lane('river', 'log', 100, [{ x: GRID_W - 1, w: CELL * 5, phase: 0 }]);
    moveLanes([right], 0.005);
    expect(right.items[0].x).toBeCloseTo(GRID_W - 0.5);
    moveLanes([right], 0.02);
    expect(right.items[0].x + right.items[0].w).toBeLessThanOrEqual(0);

    const left = lane('river', 'turtle', -100, [{ x: -CELL * 3 + 1, w: CELL * 3, phase: 0 }]);
    moveLanes([left], 0.005);
    expect(left.items[0].x).toBeCloseTo(-CELL * 3 + 0.5);
    moveLanes([left], 0.02);
    expect(left.items[0].x).toBeGreaterThanOrEqual(GRID_W);
  });

  it('the loop hides the longest item completely while it wraps', () => {
    const longest = Math.max(...LANES.map((spec) => spec.length ?? 0)) * CELL;
    expect(LOOP - GRID_W).toBeGreaterThanOrEqual(longest);
    expect(LOOP).toBe(GRID_W + WRAP_MARGIN * 2);
  });
});

describe('standing', () => {
  const car = { x: 200, w: CELL, phase: 0 };
  const log = { x: 200, w: CELL * 4, phase: 0 };

  it('traffic hits a hopper it overlaps', () => {
    const road = lane('road', 'car', 70, [car]);
    expect(hazardAt(road, 224, 1, 0)).toBe('SPLAT');
    expect(hazardAt(road, 100, 1, 0)).toBeNull();
    // Bumper forgiveness: just touching the very edge is not a hit.
    expect(hazardAt(road, 200 + 4 - CELL * 0.3, 1, 0)).toBeNull();
    expect(hazardAt(road, 200 + 5 - CELL * 0.3, 1, 0)).toBe('SPLAT');
  });

  it('the river needs something to stand on', () => {
    const river = lane('river', 'log', 70, [log]);
    expect(hazardAt(river, 300, 1, 0)).toBeNull();
    expect(hazardAt(river, 100, 1, 0)).toBe('SPLASH');
    expect(itemUnder(river, 300, 2, 1, 0)).toBe(log);
    // The very ends of a log do not hold.
    expect(hazardAt(river, 201, 1, 0)).toBe('SPLASH');
  });

  it('pavement and the goal row are always safe to stand on', () => {
    expect(hazardAt(lane('safe', undefined, 0, []), 300, 1, 0)).toBeNull();
    expect(hazardAt(lane('goal', undefined, 0, []), 300, 1, 0)).toBeNull();
  });

  it('turtles dive from level 2, and a dived group does not hold', () => {
    // sin(elapsed / 900 + phase) peaks at phase = PI / 2 when elapsed is 0.
    const diving = { x: 200, w: CELL * 2, phase: Math.PI / 2 };
    const river = lane('river', 'turtle', -90, [diving]);
    expect(submerged(diving, 1, 0)).toBe(false);
    expect(submerged(diving, 2, 0)).toBe(true);
    expect(hazardAt(river, 248, 1, 0)).toBeNull();
    expect(hazardAt(river, 248, 2, 0)).toBe('SPLASH');
    // Later in the cycle the same group is back up.
    expect(submerged(diving, 2, 900 * Math.PI)).toBe(false);
  });

  it('logs never dive', () => {
    const river = lane('river', 'log', 70, [{ x: 200, w: CELL * 4, phase: Math.PI / 2 }]);
    expect(hazardAt(river, 300, 5, 0)).toBeNull();
  });

  it('a ride carries the hopper off the grid only past the edge', () => {
    expect(sweptAway(columnX(0))).toBe(false);
    expect(sweptAway(columnX(COLS - 1))).toBe(false);
    expect(sweptAway(CELL * 0.2)).toBe(true);
    expect(sweptAway(GRID_W - CELL * 0.2)).toBe(true);
  });
});

describe('docks', () => {
  it('each dock covers its two columns, and the bank between them is solid', () => {
    DOCK_COLS.forEach((col, dock) => {
      for (let i = 0; i < DOCK_WIDTH; i++) expect(dockAt(columnX(col + i))).toBe(dock);
      expect(dockCentre(dock)).toBe((col + DOCK_WIDTH / 2) * CELL);
    });
    const dockColumns = new Set(DOCK_COLS.flatMap((col) => Array.from({ length: DOCK_WIDTH }, (_, i) => col + i)));
    for (let col = 0; col < COLS; col++) if (!dockColumns.has(col)) expect(dockAt(columnX(col)), `column ${col}`).toBe(-1);
  });

  it('every dock lies inside the grid', () => {
    for (const col of DOCK_COLS) expect(col + DOCK_WIDTH).toBeLessThanOrEqual(COLS);
  });

  it('pays a base, a bonus per whole second left, and the orb', () => {
    expect(dockPoints(0, false)).toBe(POINTS_DOCK);
    expect(dockPoints(12.2, false)).toBe(POINTS_DOCK + 13 * POINTS_PER_SECOND_LEFT);
    expect(dockPoints(12.2, true)).toBe(POINTS_DOCK + 13 * POINTS_PER_SECOND_LEFT + POINTS_ORB);
  });

  it('lists the docks that are still empty', () => {
    expect(freeDocks([false, true, false, true, true])).toEqual([0, 2]);
    expect(freeDocks([true, true])).toEqual([]);
  });
});

describe('daily challenge', () => {
  it('lays out the same lanes for the same day and level', () => {
    const lanes = (day: string, level: number) => buildLanes(level, dailyRng('hop', day, `lanes:${level}`).next);
    expect(lanes('2026-11-13', 1)).toEqual(lanes('2026-11-13', 1));
    expect(lanes('2026-11-13', 3)).toEqual(lanes('2026-11-13', 3));
    expect(lanes('2026-11-14', 1)).not.toEqual(lanes('2026-11-13', 1));
  });

  it('waits between the shortest and longest time for the next orb', () => {
    expect(orbWait(() => 0)).toBe(ORB_WAIT_MS.min);
    expect(orbWait(() => 0.5)).toBe((ORB_WAIT_MS.min + ORB_WAIT_MS.max) / 2);
    expect(orbWait(() => 0.999999)).toBeLessThan(ORB_WAIT_MS.max);
  });

  it('gives every player the same orb schedule', () => {
    const waits = () => {
      const rng = dailyRng('hop', '2026-11-13', 'orbs');
      return Array.from({ length: 5 }, () => orbWait(rng.next));
    };
    expect(waits()).toEqual(waits());
  });
});
