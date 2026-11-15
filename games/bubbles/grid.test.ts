import { describe, expect, it } from 'vitest';
import { createRng } from '../../shared/rng';
import {
  bubbles,
  buildField,
  cellCenter,
  colorsPresent,
  createGrid,
  crossed,
  findFloating,
  findGroup,
  type Grid,
  inBounds,
  isEmpty,
  isShifted,
  nearestFreeCell,
  neighbors,
  placeBubble,
  pushRow,
  rowWidth,
} from './grid';

const R = 10;

/**
 * Builds a grid from text rows: a digit is a bubble of that color, '.' an empty cell. Spaces are
 * ignored, so shifted rows can be indented to look like the field.
 */
function gridFrom(rows: string[], cols: number, totalRows = rows.length + 2, offset: 0 | 1 = 0): Grid {
  const grid = createGrid(cols, totalRows, offset);
  rows.forEach((line, row) => {
    [...line.replace(/ /g, '')].forEach((ch, col) => {
      grid.cells[row][col] = ch === '.' ? null : Number(ch);
    });
  });
  return grid;
}

const refs = (list: { row: number; col: number }[]) => list.map((c) => `${c.row},${c.col}`).sort();

describe('hex layout', () => {
  it('alternates full rows and shifted rows one cell shorter', () => {
    const grid = createGrid(8, 4);
    expect([0, 1, 2, 3].map((r) => isShifted(grid, r))).toEqual([false, true, false, true]);
    expect([0, 1, 2, 3].map((r) => rowWidth(grid, r))).toEqual([8, 7, 8, 7]);
    const flipped = createGrid(8, 4, 1);
    expect(isShifted(flipped, 0)).toBe(true);
    expect(rowWidth(flipped, 0)).toBe(7);
  });

  it('keeps cells inside the field', () => {
    const grid = createGrid(8, 4);
    expect(inBounds(grid, 0, 7)).toBe(true);
    expect(inBounds(grid, 1, 7)).toBe(false);
    expect(inBounds(grid, -1, 0)).toBe(false);
    expect(inBounds(grid, 4, 0)).toBe(false);
    expect(inBounds(grid, 0, -1)).toBe(false);
  });

  it('places centres a bubble apart, shifted rows half a bubble right', () => {
    const grid = createGrid(8, 4);
    expect(cellCenter(grid, 0, 0, R)).toEqual({ x: 10, y: 10 });
    expect(cellCenter(grid, 0, 1, R)).toEqual({ x: 30, y: 10 });
    const c = cellCenter(grid, 1, 0, R);
    expect(c.x).toBe(20);
    expect(c.y).toBeCloseTo(10 + 10 * Math.sqrt(3));
    // The last cell of a full row touches the right wall.
    expect(cellCenter(grid, 0, 7, R).x + R).toBe(8 * 2 * R);
    expect(cellCenter(grid, 1, 6, R).x + R).toBe(8 * 2 * R - R);
  });

  it('finds six neighbours, all exactly one bubble width away', () => {
    const grid = createGrid(8, 6);
    for (const [row, col] of [
      [2, 3],
      [3, 3],
    ]) {
      const list = neighbors(grid, row, col);
      expect(list).toHaveLength(6);
      const c = cellCenter(grid, row, col, R);
      for (const n of list) {
        const p = cellCenter(grid, n.row, n.col, R);
        expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeCloseTo(2 * R);
      }
    }
  });

  it('uses the right columns above and below on full and shifted rows', () => {
    const grid = createGrid(8, 6);
    expect(refs(neighbors(grid, 2, 3))).toEqual(refs([
      { row: 2, col: 2 },
      { row: 2, col: 4 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 3, col: 2 },
      { row: 3, col: 3 },
    ]));
    expect(refs(neighbors(grid, 1, 3))).toEqual(refs([
      { row: 1, col: 2 },
      { row: 1, col: 4 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ]));
  });

  it('drops neighbours outside the walls and ceiling', () => {
    const grid = createGrid(8, 6);
    expect(refs(neighbors(grid, 0, 0))).toEqual(refs([
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ]));
    // The right end of a shifted row touches the last two cells of the full rows around it.
    expect(refs(neighbors(grid, 1, 6))).toEqual(refs([
      { row: 1, col: 5 },
      { row: 0, col: 6 },
      { row: 0, col: 7 },
      { row: 2, col: 6 },
      { row: 2, col: 7 },
    ]));
  });
});

describe('snapping a landed bubble', () => {
  it('sticks to the ceiling in the nearest column', () => {
    const grid = createGrid(8, 6);
    expect(nearestFreeCell(grid, 52, 10, R)).toEqual({ row: 0, col: 2 });
    expect(nearestFreeCell(grid, 0, 10, R)).toEqual({ row: 0, col: 0 });
  });

  it('settles under the bubble it hit', () => {
    const grid = gridFrom(['..1.....'], 8);
    // Just below bubble (0, 2) at x 50, slightly to its left: the shifted row below holds cols 1 and 2 under it.
    expect(nearestFreeCell(grid, 46, 34, R)).toEqual({ row: 1, col: 1 });
    expect(nearestFreeCell(grid, 56, 34, R)).toEqual({ row: 1, col: 2 });
  });

  it('never picks an occupied cell', () => {
    const grid = gridFrom(['11111111'], 8);
    const cell = nearestFreeCell(grid, 50, 10, R)!;
    expect(cell.row).toBe(1);
  });

  it('prefers a cell that hangs from something over a nearer loose one', () => {
    const grid = gridFrom(['1.......'], 8);
    // Far below everything: the nearest empty cell is floating, so it takes a cell next to the bubble or the ceiling.
    const cell = nearestFreeCell(grid, 10, 120, R)!;
    expect(cell.row).toBeLessThanOrEqual(1);
  });

  it('returns null only for a full field', () => {
    const grid = createGrid(2, 1);
    grid.cells[0] = [1, 1];
    expect(nearestFreeCell(grid, 10, 10, R)).toBeNull();
  });
});

describe('matching groups', () => {
  it('flood-fills the same color through hex neighbours only', () => {
    const grid = gridFrom(['1122....', ' 1.2....', '1.......'], 8);
    expect(refs(findGroup(grid, 0, 0))).toEqual(refs([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ]));
    expect(findGroup(grid, 0, 2)).toHaveLength(3);
  });

  it('returns nothing for an empty cell', () => {
    expect(findGroup(createGrid(4, 2), 0, 0)).toEqual([]);
  });

  it('pops a group of three and keeps a pair', () => {
    const grid = gridFrom(['11......'], 8);
    const pair = placeBubble(gridFrom(['1.......'], 8), 0, 1, 1, 3);
    expect(pair).toEqual({ popped: [], dropped: [] });
    const out = placeBubble(grid, 0, 2, 1, 3);
    expect(out.popped).toHaveLength(3);
    expect(isEmpty(grid)).toBe(true);
  });
});

describe('floating clusters', () => {
  it('finds bubbles with no path to the ceiling', () => {
    const grid = gridFrom(['1.......', ' 2......', '..3.....', ' ....4..'], 8);
    // (1,0) hangs from (0,0); (2,2) touches neither, and (3,4) hangs alone.
    expect(refs(findFloating(grid))).toEqual(refs([
      { row: 2, col: 2 },
      { row: 3, col: 4 },
    ]));
  });

  it('drops everything that hung from a popped group', () => {
    // A red bridge holds a blue cluster; popping the bridge drops the cluster.
    const grid = gridFrom(['..11....', ' ..2....', '...22...'], 8);
    const out = placeBubble(grid, 0, 4, 1, 3);
    expect(out.popped).toHaveLength(3);
    expect(refs(out.dropped)).toEqual(refs([
      { row: 1, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ]));
    expect(isEmpty(grid)).toBe(true);
  });

  it('keeps bubbles that still hang from another anchor', () => {
    const grid = gridFrom(['11.3....', ' .33....'], 8);
    const out = placeBubble(grid, 0, 2, 1, 3);
    expect(out.popped).toHaveLength(3);
    expect(out.dropped).toEqual([]);
    expect(colorsPresent(grid)).toEqual([3]);
  });
});

describe('ceiling and field', () => {
  it('pushes a row in at the top, keeping every bubble the same shape', () => {
    const grid = gridFrom(['12......', ' 3......'], 8, 5);
    const before = bubbles(grid).map((b) => ({ ...b, x: cellCenter(grid, b.row, b.col, R).x }));
    pushRow(grid, () => 4);
    expect(grid.offset).toBe(1);
    expect(rowWidth(grid, 0)).toBe(7);
    expect(grid.cells[0].slice(0, 7).every((c) => c === 4)).toBe(true);
    expect(grid.cells[0][7]).toBeNull();
    for (const b of before) {
      expect(grid.cells[b.row + 1][b.col]).toBe(b.color);
      expect(cellCenter(grid, b.row + 1, b.col, R).x).toBe(b.x);
    }
    expect(grid.cells).toHaveLength(5);
    pushRow(grid, () => 5);
    expect(grid.offset).toBe(0);
    expect(rowWidth(grid, 0)).toBe(8);
  });

  it('notices a bubble on or past the line', () => {
    const grid = createGrid(8, 6);
    expect(crossed(grid, 5)).toBe(false);
    grid.cells[4][0] = 1;
    expect(crossed(grid, 5)).toBe(false);
    grid.cells[5][0] = 1;
    expect(crossed(grid, 5)).toBe(true);
  });

  it('pushes the bottom row over the line', () => {
    const grid = createGrid(8, 4);
    grid.cells[2][0] = 1;
    pushRow(grid, () => 0);
    expect(crossed(grid, 3)).toBe(true);
  });

  it('builds a full field of the requested colors', () => {
    const grid = buildField(8, 10, 5, 4, 0.5, createRng('field').next);
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < rowWidth(grid, row); col++) {
        const c = grid.cells[row][col];
        if (row < 5) expect(c).not.toBeNull();
        else expect(c).toBeNull();
        if (c !== null) expect(c).toBeLessThan(4);
      }
    }
    expect(findFloating(grid)).toEqual([]);
  });

  it('builds the same field from the same seed, with clusters when asked', () => {
    const a = buildField(8, 10, 5, 4, 0.5, createRng('same').next);
    const b = buildField(8, 10, 5, 4, 0.5, createRng('same').next);
    expect(a).toEqual(b);
    const mono = buildField(8, 10, 3, 4, 1, () => 0);
    expect(colorsPresent(mono)).toEqual([0]);
  });
});
