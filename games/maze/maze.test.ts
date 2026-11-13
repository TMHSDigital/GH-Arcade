import { describe, expect, it } from 'vitest';
import { BONUS_AT, COLS, ROWS } from './config';
import { BONUS_CELL, DIRS, DOOR, find, HOUSE_EXIT, MAZE, open, tile, TUNNEL_ROW, VEC, wrapX } from './maze';

/** Every cell holding the given character. */
function cells(ch: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  MAZE.forEach((row, y) => [...row].forEach((c, x) => c === ch && out.push({ x, y })));
  return out;
}

/** Cells the runner can walk to from the start, tunnel wrap included. */
function reachable(): Set<string> {
  const start = find('P');
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.pop()!;
    for (const d of DIRS) {
      const nx = wrapX(x + VEC[d].x);
      const ny = y + VEC[d].y;
      const key = `${nx},${ny}`;
      if (!seen.has(key) && open(nx, ny)) {
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return seen;
}

describe('maze layout', () => {
  it('is ROWS rows of COLS cells', () => {
    expect(MAZE).toHaveLength(ROWS);
    for (const row of MAZE) expect(row).toHaveLength(COLS);
  });

  it('is mirrored left to right', () => {
    for (const row of MAZE) expect([...row].reverse().join('')).toBe(row);
  });

  it('uses only known tiles', () => {
    for (const row of MAZE) expect(row).toMatch(/^[#.o\-GP ]+$/);
  });

  it('is closed along the top and bottom', () => {
    expect(MAZE[0]).toMatch(/^#+$/);
    expect(MAZE[ROWS - 1]).toMatch(/^#+$/);
  });
});

describe('tunnel', () => {
  it('wrapX wraps both edges', () => {
    expect(wrapX(-1)).toBe(COLS - 1);
    expect(wrapX(COLS)).toBe(0);
    expect(wrapX(5)).toBe(5);
  });

  it('is open at both ends of the tunnel row, and only there', () => {
    expect(open(0, TUNNEL_ROW)).toBe(true);
    expect(open(COLS - 1, TUNNEL_ROW)).toBe(true);
    MAZE.forEach((row, y) => {
      if (y !== TUNNEL_ROW) expect(row[0], `row ${y}`).toBe('#');
    });
  });

  it('treats rows outside the grid as wall', () => {
    expect(tile(3, -1)).toBe('#');
    expect(tile(3, ROWS)).toBe('#');
  });
});

describe('special cells', () => {
  it('the door is a door tile and is not open', () => {
    expect(tile(DOOR.x, DOOR.y)).toBe('-');
    expect(open(DOOR.x, DOOR.y)).toBe(false);
  });

  it('the house exit sits just above the door and is open', () => {
    expect(HOUSE_EXIT).toEqual({ x: DOOR.x, y: DOOR.y - 1 });
    expect(open(HOUSE_EXIT.x, HOUSE_EXIT.y)).toBe(true);
  });

  it('the bonus cell is open and holds no dot', () => {
    expect(tile(BONUS_CELL.x, BONUS_CELL.y)).toBe(' ');
  });

  it('has one runner start and four power cells', () => {
    expect(cells('P')).toHaveLength(1);
    expect(cells('o')).toHaveLength(4);
  });

  it('has more dots than the highest bonus threshold', () => {
    expect(cells('.').length).toBeGreaterThan(Math.max(...BONUS_AT));
  });
});

describe('reachability', () => {
  const seen = reachable();

  it('every dot and power cell can be reached from the start', () => {
    for (const { x, y } of [...cells('.'), ...cells('o')]) expect(seen.has(`${x},${y}`), `${x},${y}`).toBe(true);
  });

  it('the house exit and the bonus cell can be reached', () => {
    expect(seen.has(`${HOUSE_EXIT.x},${HOUSE_EXIT.y}`)).toBe(true);
    expect(seen.has(`${BONUS_CELL.x},${BONUS_CELL.y}`)).toBe(true);
  });

  it('the house itself is sealed off from the runner', () => {
    for (const { x, y } of cells('G')) expect(seen.has(`${x},${y}`), `${x},${y}`).toBe(false);
  });
});
