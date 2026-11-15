/**
 * The hex-packed bubble field, with no Phaser in it so it can be tested. Rows hang from the ceiling
 * (row 0) and alternate between full rows of `cols` cells and shifted rows of `cols - 1` cells that
 * sit half a bubble to the right. Positions are in field pixels: x from the left wall, y from the ceiling.
 */

/** A bubble's color index, or null for an empty cell. */
export type Cell = number | null;

export interface Grid {
  cols: number;
  /** Rows the field can hold, the last one being the line a bubble must not reach. */
  rows: number;
  /**
   * 1 when row 0 is a shifted row. Pushing a row in at the ceiling moves every row down one, so
   * this flips each time to keep each bubble's row shape.
   */
  offset: 0 | 1;
  /** cells[row][col]. Every row is `cols` long; the last cell of a shifted row is never used. */
  cells: Cell[][];
}

export interface CellRef {
  row: number;
  col: number;
}

export interface Bubble extends CellRef {
  color: number;
}

/** An empty field. */
export function createGrid(cols: number, rows: number, offset: 0 | 1 = 0): Grid {
  return { cols, rows, offset, cells: Array.from({ length: rows }, () => new Array<Cell>(cols).fill(null)) };
}

/** True for rows that sit half a bubble to the right and hold one cell fewer. */
export function isShifted(grid: Grid, row: number): boolean {
  return (row + grid.offset) % 2 === 1;
}

export function rowWidth(grid: Grid, row: number): number {
  return isShifted(grid, row) ? grid.cols - 1 : grid.cols;
}

export function inBounds(grid: Grid, row: number, col: number): boolean {
  return row >= 0 && row < grid.rows && col >= 0 && col < rowWidth(grid, row);
}

export function colorAt(grid: Grid, row: number, col: number): Cell {
  return inBounds(grid, row, col) ? grid.cells[row][col] : null;
}

/** Centre of a cell in field pixels, for bubbles of radius `r`. */
export function cellCenter(grid: Grid, row: number, col: number, r: number): { x: number; y: number } {
  return { x: r + col * 2 * r + (isShifted(grid, row) ? r : 0), y: r + row * r * Math.sqrt(3) };
}

/** The (up to six) cells touching a cell. */
export function neighbors(grid: Grid, row: number, col: number): CellRef[] {
  // A shifted row sits half a cell right, so the rows above and below touch columns col and col + 1;
  // a full row touches col - 1 and col.
  const lo = isShifted(grid, row) ? col : col - 1;
  const out: CellRef[] = [];
  const add = (r: number, c: number) => {
    if (inBounds(grid, r, c)) out.push({ row: r, col: c });
  };
  add(row, col - 1);
  add(row, col + 1);
  add(row - 1, lo);
  add(row - 1, lo + 1);
  add(row + 1, lo);
  add(row + 1, lo + 1);
  return out;
}

/** Every occupied cell. */
export function bubbles(grid: Grid): Bubble[] {
  const out: Bubble[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < rowWidth(grid, row); col++) {
      const color = grid.cells[row][col];
      if (color !== null) out.push({ row, col, color });
    }
  }
  return out;
}

export function isEmpty(grid: Grid): boolean {
  return grid.cells.every((cells, row) => cells.slice(0, rowWidth(grid, row)).every((c) => c === null));
}

/** The distinct colors still on the field, in ascending order. */
export function colorsPresent(grid: Grid): number[] {
  return [...new Set(bubbles(grid).map((b) => b.color))].sort((a, b) => a - b);
}

/** True once any bubble sits in `loseRow` or below it. */
export function crossed(grid: Grid, loseRow: number): boolean {
  for (let row = Math.max(0, loseRow); row < grid.rows; row++) {
    if (grid.cells[row].slice(0, rowWidth(grid, row)).some((c) => c !== null)) return true;
  }
  return false;
}

/**
 * The free cell a bubble at (x, y) settles into: the nearest empty cell that hangs from the ceiling
 * or touches another bubble, so a shot never sticks in mid-air. Falls back to the nearest empty cell
 * of any kind, and null only when the field is full.
 */
export function nearestFreeCell(grid: Grid, x: number, y: number, r: number): CellRef | null {
  let best: CellRef | null = null;
  let bestD = Infinity;
  let loose: CellRef | null = null;
  let looseD = Infinity;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < rowWidth(grid, row); col++) {
      if (grid.cells[row][col] !== null) continue;
      const c = cellCenter(grid, row, col, r);
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < looseD) {
        looseD = d;
        loose = { row, col };
      }
      if (d < bestD && (row === 0 || neighbors(grid, row, col).some((n) => grid.cells[n.row][n.col] !== null))) {
        bestD = d;
        best = { row, col };
      }
    }
  }
  return best ?? loose;
}

/** The connected group of same-colored bubbles that includes the given cell (empty if the cell is). */
export function findGroup(grid: Grid, row: number, col: number): Bubble[] {
  const color = colorAt(grid, row, col);
  if (color === null) return [];
  const seen = new Set<string>([`${row},${col}`]);
  const queue: CellRef[] = [{ row, col }];
  const out: Bubble[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    out.push({ ...cur, color });
    for (const n of neighbors(grid, cur.row, cur.col)) {
      const key = `${n.row},${n.col}`;
      if (seen.has(key) || grid.cells[n.row][n.col] !== color) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return out;
}

/** Bubbles with no chain of bubbles leading up to the ceiling: they fall. */
export function findFloating(grid: Grid): Bubble[] {
  const seen = new Set<string>();
  const queue: CellRef[] = [];
  for (let col = 0; col < rowWidth(grid, 0); col++) {
    if (grid.cells[0][col] !== null) {
      seen.add(`0,${col}`);
      queue.push({ row: 0, col });
    }
  }
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbors(grid, cur.row, cur.col)) {
      const key = `${n.row},${n.col}`;
      if (seen.has(key) || grid.cells[n.row][n.col] === null) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return bubbles(grid).filter((b) => !seen.has(`${b.row},${b.col}`));
}

export function removeCells(grid: Grid, cells: readonly CellRef[]): void {
  for (const c of cells) grid.cells[c.row][c.col] = null;
}

/** What one shot did: the bubbles that popped and the ones that fell once cut loose. */
export interface ShotOutcome {
  popped: Bubble[];
  dropped: Bubble[];
}

/**
 * Settles a bubble into a cell. If it joins a same-color group of at least `minGroup`, the group
 * pops, and any bubbles left hanging from nothing fall. Changes the grid in place.
 */
export function placeBubble(grid: Grid, row: number, col: number, color: number, minGroup: number): ShotOutcome {
  grid.cells[row][col] = color;
  const group = findGroup(grid, row, col);
  if (group.length < minGroup) return { popped: [], dropped: [] };
  removeCells(grid, group);
  const dropped = findFloating(grid);
  removeCells(grid, dropped);
  return { popped: group, dropped };
}

/**
 * Pushes a new row in at the ceiling, moving every bubble down one row. `color` picks each new
 * bubble's color. Whatever was in the last row falls off the grid, so check crossed() first.
 */
export function pushRow(grid: Grid, color: () => number): void {
  grid.offset = grid.offset === 0 ? 1 : 0;
  const row = new Array<Cell>(grid.cols).fill(null);
  for (let col = 0; col < rowWidth(grid, 0); col++) row[col] = color();
  grid.cells.unshift(row);
  grid.cells.pop();
}

/**
 * A fresh field: `filledRows` rows of bubbles in `colorCount` colors. Each bubble may copy the color
 * of the one to its left or above it (`clusterChance`), so the field starts with groups to aim at.
 * `random` returns 0..1 like Math.random.
 */
export function buildField(
  cols: number,
  rows: number,
  filledRows: number,
  colorCount: number,
  clusterChance: number,
  random: () => number = Math.random,
): Grid {
  const grid = createGrid(cols, rows);
  for (let row = 0; row < Math.min(filledRows, rows); row++) {
    for (let col = 0; col < rowWidth(grid, row); col++) {
      const near = neighbors(grid, row, col)
        .filter((n) => n.row < row || (n.row === row && n.col < col))
        .map((n) => grid.cells[n.row][n.col])
        .filter((c): c is number => c !== null);
      grid.cells[row][col] =
        near.length && random() < clusterChance ? near[Math.floor(random() * near.length)] : Math.floor(random() * colorCount);
    }
  }
  return grid;
}
