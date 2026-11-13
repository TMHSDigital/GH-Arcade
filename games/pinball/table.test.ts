import { describe, expect, it } from 'vitest';
import { TROPHIES } from '../../shared/achievements';
import {
  BUMPERS,
  type Circle,
  FLIPPER_PIVOTS,
  LANE_INNER,
  LANE_X,
  LANES,
  PLUNGER_Y,
  type Point,
  POSTS,
  type Segment,
  SLINGS,
  STANDUPS,
  TARGETS,
  WALLS,
} from './table';

const segments: [string, Segment[]][] = [
  ['WALLS', WALLS],
  ['SLINGS', SLINGS],
  ['TARGETS', TARGETS],
  ['STANDUPS', STANDUPS],
];
const circles: [string, Circle[]][] = [
  ['BUMPERS', BUMPERS],
  ['POSTS', POSTS],
  ['LANES', LANES],
];

const same = (p: Point, q: Point) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
/** Left edge of the playfield; the launch lane divider is its right edge. */
const LEFT_WALL_X = 200;

describe('pinball table data', () => {
  it.each(segments)('%s has finite coordinates and no zero-length segment', (_name, list) => {
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) {
      for (const v of [s.a.x, s.a.y, s.b.x, s.b.y]) expect(Number.isFinite(v)).toBe(true);
      expect(same(s.a, s.b)).toBe(false);
    }
  });

  it.each(circles)('%s has finite coordinates and a positive radius', (_name, list) => {
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      for (const v of [c.x, c.y, c.r]) expect(Number.isFinite(v)).toBe(true);
      expect(c.r).toBeGreaterThan(0);
    }
  });

  it('the plunger and lane constants are finite and the lane lies right of its divider', () => {
    for (const v of [LANE_X, LANE_INNER, PLUNGER_Y]) expect(Number.isFinite(v)).toBe(true);
    expect(LANE_X).toBeGreaterThan(LANE_INNER);
  });
});

describe('pinball outline', () => {
  // WALLS starts with the left wall, then the arch, then the outer wall of the launch lane.
  const leftWall = WALLS[0];
  const archStart = 1;
  const archEnd = WALLS.findIndex((s, i) => i > archStart && s.a.x === s.b.x);
  const arch = WALLS.slice(archStart, archEnd);
  const rightWall = WALLS[archEnd];

  it('the arch is a chain of segments that share endpoints', () => {
    expect(arch.length).toBeGreaterThan(4);
    for (let i = 1; i < arch.length; i++) expect(same(arch[i - 1].b, arch[i].a), `arch segment ${i}`).toBe(true);
  });

  it('the arch joins the side walls without a gap', () => {
    expect(same(leftWall.b, arch[0].a)).toBe(true);
    expect(same(arch[arch.length - 1].b, rightWall.a)).toBe(true);
  });

  it('the arch rises above the points where it meets the walls', () => {
    const top = Math.min(...arch.map((s) => s.b.y));
    expect(top).toBeLessThan(leftWall.b.y);
  });
});

describe('pinball features', () => {
  it('flipper pivots mirror each other across the playfield centre', () => {
    const [left, right] = FLIPPER_PIVOTS;
    expect(FLIPPER_PIVOTS).toHaveLength(2);
    expect(left.y).toBe(right.y);
    expect((left.x + right.x) / 2).toBe((LEFT_WALL_X + LANE_INNER) / 2);
  });

  it('slingshots mirror each other', () => {
    const centre = (LEFT_WALL_X + LANE_INNER) / 2;
    const xs = SLINGS.flatMap((s) => [s.a.x, s.b.x]).map((x) => Math.abs(x - centre)).sort((a, b) => a - b);
    expect(xs[0]).toBe(xs[1]);
    expect(xs[2]).toBe(xs[3]);
  });

  it('has the three top lanes the Lane Lighter trophy describes', () => {
    const trophy = TROPHIES.find((t) => t.id === 'pinball.lanes')!;
    expect(trophy.description).toMatch(/three/i);
    expect(LANES).toHaveLength(3);
  });

  it('has a drop-target bank on the left wall and standups on the right', () => {
    expect(TARGETS.length).toBeGreaterThanOrEqual(2);
    for (const t of TARGETS) expect(t.a.x).toBeLessThan((LEFT_WALL_X + LANE_INNER) / 2);
    for (const s of STANDUPS) expect(s.a.x).toBeGreaterThan((LEFT_WALL_X + LANE_INNER) / 2);
  });

  it('keeps bumpers, posts and lanes inside the playfield', () => {
    for (const c of [...BUMPERS, ...POSTS, ...LANES]) {
      expect(c.x - c.r).toBeGreaterThan(LEFT_WALL_X);
      expect(c.x + c.r).toBeLessThan(LANE_INNER);
    }
  });
});
