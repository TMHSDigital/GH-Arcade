import { describe, expect, it } from 'vitest';
import { CELL, COLS, ROWS } from './config';
import { BOOST_DIRS, type Hole, type HoleDef, holeProblems, HOLES, isSolidTile, parseHole, tileOf } from './holes';
import { moverRect, simulateShot } from './physics';

const ANGLES = 72;
const POWERS = [0.06, 0.12, 0.2, 0.3, 0.42, 0.55, 0.7, 0.85, 1];

/**
 * The fewest strokes a brute-force golfer needs to hole out, trying 72 directions and 9 strengths
 * from every spot it can reach, or null if it cannot within `limit`. Spots are grouped by half-cell
 * so the search stays small. Blockers are timed from the start of each shot. Every line it finds is
 * a real one, so a hole it can play in par strokes can be played in par.
 */
function fewestStrokes(hole: Hole, limit: number): number | null {
  const key = (x: number, y: number) => `${Math.floor(x / (CELL / 2))},${Math.floor(y / (CELL / 2))}`;
  let frontier = [hole.tee];
  const seen = new Set([key(hole.tee.x, hole.tee.y)]);
  for (let strokes = 1; strokes <= limit; strokes++) {
    const next: { x: number; y: number }[] = [];
    for (const from of frontier) {
      for (let a = 0; a < ANGLES; a++) {
        for (const power of POWERS) {
          const shot = simulateShot(hole, from.x, from.y, (a / ANGLES) * Math.PI * 2, power);
          if (shot.event === 'sunk') return strokes;
          if (shot.event !== 'rest') continue;
          const k = key(shot.x, shot.y);
          if (seen.has(k)) continue;
          seen.add(k);
          next.push({ x: shot.x, y: shot.y });
        }
      }
    }
    frontier = next;
  }
  return null;
}

describe('holes', () => {
  it('there are nine, all named differently', () => {
    expect(HOLES).toHaveLength(9);
    expect(new Set(HOLES.map((h) => h.name)).size).toBe(HOLES.length);
  });

  it.each(HOLES.map((h) => [h.name, h] as const))('%s parses, with exactly one tee and one cup', (_name, def) => {
    expect(holeProblems(def)).toEqual([]);
    const hole = parseHole(def);
    const all = hole.grid.join('');
    expect(all.split('T')).toHaveLength(2);
    expect(all.split('O')).toHaveLength(2);
    expect(hole.grid).toHaveLength(ROWS);
    for (const row of hole.grid) expect(row).toHaveLength(COLS);
  });

  it.each(HOLES.map((h) => [h.name, h] as const))('%s is closed in, so the ball can never leave the grid', (_name, def) => {
    const { grid } = parseHole(def);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (isSolidTile(grid[y][x])) continue;
        expect(y > 0 && y < ROWS - 1 && x > 0 && x < COLS - 1, `open edge cell at ${x},${y}`).toBe(true);
      }
    }
  });

  it.each(HOLES.filter((h) => h.movers?.length).map((h) => [h.name, h] as const))('%s keeps its blockers off the walls, with room for the ball to pass', (_name, def) => {
    const hole = parseHole(def);
    for (const m of hole.movers) {
      for (const t of [0, m.period / 2]) {
        const r = moverRect(m, t - (m.phase ?? 0) * m.period);
        // At both ends of its track a blocker leaves at least a ball's width plus some room between it and any wall.
        const gap = 24;
        for (let y = Math.floor((r.y - gap) / CELL); y <= Math.floor((r.y + r.h + gap - 1) / CELL); y++) {
          for (let x = Math.floor((r.x - gap) / CELL); x <= Math.floor((r.x + r.w + gap - 1) / CELL); x++) {
            expect(isSolidTile(tileOf(hole.grid, x, y)), `${def.name} blocker near wall at ${x},${y}`).toBe(false);
          }
        }
      }
    }
  });

  it.each(HOLES.map((h) => [h.name, h] as const))('%s can be played in par', (_name, def) => {
    const hole = parseHole(def);
    const best = fewestStrokes(hole, def.par);
    expect(best, `${def.name}: no line found in ${def.par}`).not.toBeNull();
  });
});

describe('holeProblems', () => {
  const base = (rows: string[]): HoleDef => ({ name: 'TEST', par: 2, rows });

  it('accepts a simple closed hole', () => {
    expect(holeProblems(base(['', ' #####', ' #T.O#', ' #####']))).toEqual([]);
  });

  it('needs exactly one tee and one cup', () => {
    expect(holeProblems(base([' #####', ' #..O#', ' #####']))).toContain('0 tees, needs exactly one');
    expect(holeProblems(base([' ######', ' #TTO.#', ' ######']))).toContain('2 tees, needs exactly one');
    expect(holeProblems(base([' ######', ' #TOO.#', ' ######']))).toContain('2 cups, needs exactly one');
  });

  it('rejects unknown tiles, oversize layouts and a bad par', () => {
    expect(holeProblems(base([' #####', ' #TxO#', ' #####']))[0]).toMatch(/unknown tile 'x'/);
    expect(holeProblems(base([' #T.O#'.padEnd(COLS + 1, '#')]))[0]).toMatch(/at most 20/);
    expect(holeProblems(base(Array.from({ length: ROWS + 1 }, () => ''))).join()).toMatch(/at most 13/);
    expect(holeProblems({ ...base([' ####', ' #TO#', ' ####']), par: 0 })[0]).toMatch(/par 0/);
  });

  it('rejects a cup cut off from the tee, water counting as a cut', () => {
    expect(holeProblems(base([' ######', ' #T#O#', ' ######']))).toContain('the cup cannot be reached from the tee on dry ground');
    expect(holeProblems(base([' ######', ' #TwO#', ' ######']))).toContain('the cup cannot be reached from the tee on dry ground');
  });

  it('rejects a boost pad pointing into a wall', () => {
    expect(holeProblems(base([' #####', ' #T>#', ' #O.#', ' ####']))[0]).toMatch(/points into a wall/);
  });

  it('parseHole throws with the problems, and puts the tee and cup at cell centers', () => {
    expect(() => parseHole(base(['#T#']))).toThrow(/TEST: .*cups/);
    const hole = parseHole(base(['', ' #####', ' #T.O#', ' #####']));
    expect(hole.tee).toEqual({ x: 2 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 });
    expect(hole.cup).toEqual({ x: 4 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 });
    expect(hole.movers).toEqual([]);
  });

  it('has a direction for every boost pad', () => {
    expect(Object.keys(BOOST_DIRS).sort()).toEqual(['<', '>', '^', 'v']);
  });
});
