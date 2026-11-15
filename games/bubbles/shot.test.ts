import { describe, expect, it } from 'vitest';
import { cellCenter, createGrid } from './grid';
import { aimAt, clampAim, pathLength, pointAlong, simulateShot } from './shot';

const R = 10;
const OPTS = { r: R, collide: 0.8 };
/** A field 8 cells wide (160 px) and 12 rows deep, with the launcher at the bottom middle. */
const START = { x: 80, y: 300 };

describe('aiming', () => {
  it('clamps the aim inside the fan', () => {
    expect(clampAim(2, 1.3)).toBe(1.3);
    expect(clampAim(-2, 1.3)).toBe(-1.3);
    expect(clampAim(0.4, 1.3)).toBe(0.4);
  });

  it('aims at a point: straight up is 0, right is positive', () => {
    expect(aimAt(START, { x: 80, y: 100 }, 1.3)).toBeCloseTo(0);
    expect(aimAt(START, { x: 180, y: 200 }, 1.3)).toBeCloseTo(Math.PI / 4);
    expect(aimAt(START, { x: -20, y: 200 }, 1.3)).toBeCloseTo(-Math.PI / 4);
    // A point beside or below the launcher aims as far sideways as allowed.
    expect(aimAt(START, { x: 300, y: 320 }, 1.3)).toBe(1.3);
  });
});

describe('flight', () => {
  it('flies straight up to the ceiling in an empty field', () => {
    const grid = createGrid(8, 12);
    const shot = simulateShot(grid, START, 0, OPTS);
    expect(shot.hit).toBe('ceiling');
    expect(shot.bounces).toBe(0);
    expect(shot.path).toHaveLength(2);
    expect(shot.path[1].y).toBe(R);
    // x 80 is between columns 3 (70) and 4 (90); either is a fair ceiling snap.
    expect(shot.landing?.row).toBe(0);
    expect([3, 4]).toContain(shot.landing?.col);
  });

  it('sticks under a bubble in its way', () => {
    const grid = createGrid(8, 12);
    grid.cells[0][3] = 1;
    grid.cells[0][4] = 1;
    const shot = simulateShot(grid, START, 0, OPTS);
    expect(shot.hit).toBe('bubble');
    // Row 1 is shifted: its column 3 sits at x 80, right under the gap between the two.
    expect(shot.landing).toEqual({ row: 1, col: 3 });
    // It stopped where it first touched, well short of the centres it hit.
    const last = shot.path[shot.path.length - 1];
    expect(last.y).toBeGreaterThan(cellCenter(grid, 0, 3, R).y + R / 2);
  });

  it('bounces off a side wall at the exact contact point', () => {
    const grid = createGrid(8, 12);
    const shot = simulateShot(grid, START, -Math.PI / 4, OPTS);
    expect(shot.bounces).toBeGreaterThanOrEqual(1);
    const contact = shot.path[1];
    expect(contact.x).toBe(R);
    // At 45 degrees it rises as far as it travels sideways: 70 px to reach x = 10.
    expect(contact.y).toBeCloseTo(START.y - 70);
    // After the bounce it heads right.
    expect(shot.path[2].x).toBeGreaterThan(contact.x);
    expect(shot.landing?.row).toBe(0);
  });

  it('bounces off both walls on a steep shot', () => {
    const grid = createGrid(8, 30);
    const shot = simulateShot(grid, { x: 80, y: 600 }, 1.2, OPTS);
    expect(shot.bounces).toBeGreaterThanOrEqual(2);
    expect(shot.path[1].x).toBe(160 - R);
    expect(shot.path[2].x).toBe(R);
    expect(shot.hit).toBe('ceiling');
  });

  it('stops the guide at the second wall', () => {
    const grid = createGrid(8, 30);
    const guide = simulateShot(grid, { x: 80, y: 600 }, 1.2, { ...OPTS, maxBounces: 1 });
    expect(guide.hit).toBe('limit');
    expect(guide.landing).toBeNull();
    expect(guide.bounces).toBe(1);
    expect(guide.path).toHaveLength(3);
    expect(guide.path[2].x).toBe(R);
  });

  it('agrees with the real shot when the guide reaches a bubble', () => {
    const grid = createGrid(8, 12);
    grid.cells[0][0] = 2;
    const guide = simulateShot(grid, START, -0.5, { ...OPTS, maxBounces: 1 });
    const shot = simulateShot(grid, START, -0.5, OPTS);
    expect(guide.landing).toEqual(shot.landing);
    expect(guide.path).toEqual(shot.path);
  });

  it('can land in the last row, for the scene to end the run', () => {
    const grid = createGrid(8, 4);
    for (let row = 0; row < 3; row++) grid.cells[row].fill(1);
    const shot = simulateShot(grid, { x: 80, y: 200 }, 0, OPTS);
    expect(shot.landing?.row).toBe(3);
  });
});

describe('walking a path', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 30, y: 40 },
    { x: 30, y: 100 },
  ];

  it('measures its length', () => {
    expect(pathLength(path)).toBe(110);
    expect(pathLength([{ x: 1, y: 1 }])).toBe(0);
  });

  it('finds points along it, clamped to the ends', () => {
    expect(pointAlong(path, 25)).toEqual({ x: 15, y: 20 });
    expect(pointAlong(path, 80)).toEqual({ x: 30, y: 70 });
    expect(pointAlong(path, -5)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(path, 500)).toEqual({ x: 30, y: 100 });
  });
});
