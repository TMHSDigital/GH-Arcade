import { afterEach, describe, expect, it } from 'vitest';
import { BONUS_AT, COLS, ROWS } from './config';
import { BONUS_CELL, DIRS, DOOR, find, HOUSE_EXIT, HOUSE_Y, LAYOUTS, maze, open, tile, TUNNEL_ROW, useLayout, VEC, wrapX } from './maze';

/** Every cell of the maze in play holding the given character. */
function cells(ch: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  maze().forEach((row, y) => [...row].forEach((c, x) => c === ch && out.push({ x, y })));
  return out;
}

/** The open cells next to a cell, tunnel wrap included. */
function exits(x: number, y: number): { x: number; y: number }[] {
  return DIRS.map((d) => ({ x: wrapX(x + VEC[d].x), y: y + VEC[d].y })).filter((c) => open(c.x, c.y));
}

/** Cells the runner can walk to from the start, tunnel wrap included. */
function reachable(): Set<string> {
  const start = find('P');
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.pop()!;
    for (const next of exits(x, y)) {
      const key = `${next.x},${next.y}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push(next);
      }
    }
  }
  return seen;
}

afterEach(() => useLayout(0));

describe('layouts', () => {
  it('there are at least two, and the first is in play to begin with', () => {
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(2);
    expect(maze()).toBe(LAYOUTS[0]);
  });

  it('useLayout picks a layout by level and wraps round after the last', () => {
    useLayout(1);
    expect(maze()).toBe(LAYOUTS[1]);
    useLayout(LAYOUTS.length);
    expect(maze()).toBe(LAYOUTS[0]);
    useLayout(LAYOUTS.length + 1);
    expect(maze()).toBe(LAYOUTS[1]);
    useLayout(-1);
    expect(maze()).toBe(LAYOUTS[LAYOUTS.length - 1]);
  });

  it('are all different', () => {
    expect(new Set(LAYOUTS.map((rows) => rows.join('\n'))).size).toBe(LAYOUTS.length);
  });

  it('share the middle block (house, door, tunnel, bonus cell) and the runner start', () => {
    const middle = (rows: readonly string[]) => rows.slice(6, 13);
    for (const rows of LAYOUTS) {
      expect(middle(rows)).toEqual(middle(LAYOUTS[0]));
      expect(rows[15][12]).toBe('P');
    }
  });
});

describe('wrapX', () => {
  it('wraps both edges', () => {
    expect(wrapX(-1)).toBe(COLS - 1);
    expect(wrapX(COLS)).toBe(0);
    expect(wrapX(5)).toBe(5);
  });
});

describe.each(LAYOUTS.map((_, i) => i))('layout %i', (index) => {
  const use = () => useLayout(index);

  describe('shape', () => {
    it('is ROWS rows of COLS cells', () => {
      use();
      expect(maze()).toHaveLength(ROWS);
      for (const row of maze()) expect(row).toHaveLength(COLS);
    });

    it('is mirrored left to right', () => {
      use();
      for (const row of maze()) expect([...row].reverse().join('')).toBe(row);
    });

    it('uses only known tiles', () => {
      use();
      for (const row of maze()) expect(row).toMatch(/^[#.o\-GP ]+$/);
    });

    it('is closed along the top and bottom', () => {
      use();
      expect(maze()[0]).toMatch(/^#+$/);
      expect(maze()[ROWS - 1]).toMatch(/^#+$/);
    });
  });

  describe('tunnel', () => {
    it('is open at both ends of the tunnel row, and only there', () => {
      use();
      expect(open(0, TUNNEL_ROW)).toBe(true);
      expect(open(COLS - 1, TUNNEL_ROW)).toBe(true);
      maze().forEach((row, y) => {
        if (y !== TUNNEL_ROW) expect(row[0], `row ${y}`).toBe('#');
      });
    });

    it('treats rows outside the grid as wall', () => {
      use();
      expect(tile(3, -1)).toBe('#');
      expect(tile(3, ROWS)).toBe('#');
    });
  });

  describe('special cells', () => {
    it('the door is a door tile and is not open', () => {
      use();
      expect(tile(DOOR.x, DOOR.y)).toBe('-');
      expect(open(DOOR.x, DOOR.y)).toBe(false);
    });

    it('the house exit sits just above the door and is open', () => {
      use();
      expect(HOUSE_EXIT).toEqual({ x: DOOR.x, y: DOOR.y - 1 });
      expect(open(HOUSE_EXIT.x, HOUSE_EXIT.y)).toBe(true);
    });

    it('the house sits under the door, wide enough for the chasers waiting in it', () => {
      use();
      for (const x of [10, 12, 14]) expect(tile(x, HOUSE_Y), `column ${x}`).toBe('G');
    });

    it('the bonus cell is open and holds no dot', () => {
      use();
      expect(tile(BONUS_CELL.x, BONUS_CELL.y)).toBe(' ');
    });

    it('has one runner start and four power cells', () => {
      use();
      expect(cells('P')).toHaveLength(1);
      expect(cells('o')).toHaveLength(4);
    });

    it('has more dots than the highest bonus threshold', () => {
      use();
      expect(cells('.').length).toBeGreaterThan(Math.max(...BONUS_AT));
    });
  });

  describe('reachability', () => {
    it('every dot and power cell can be reached from the start', () => {
      use();
      const seen = reachable();
      for (const { x, y } of [...cells('.'), ...cells('o')]) expect(seen.has(`${x},${y}`), `${x},${y}`).toBe(true);
    });

    it('the house exit and the bonus cell can be reached', () => {
      use();
      const seen = reachable();
      expect(seen.has(`${HOUSE_EXIT.x},${HOUSE_EXIT.y}`)).toBe(true);
      expect(seen.has(`${BONUS_CELL.x},${BONUS_CELL.y}`)).toBe(true);
    });

    it('the house itself is sealed off from the runner', () => {
      use();
      const seen = reachable();
      for (const { x, y } of cells('G')) expect(seen.has(`${x},${y}`), `${x},${y}`).toBe(false);
    });

    it('has no dead ends, since a chaser never turns back', () => {
      use();
      for (const key of reachable()) {
        const [x, y] = key.split(',').map(Number);
        expect(exits(x, y).length, key).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
