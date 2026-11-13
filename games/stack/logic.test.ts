import { describe, expect, it } from 'vitest';
import {
  Bag,
  type Board,
  cellsOf,
  clearRows,
  collides,
  COLS,
  dropDistance,
  emptyBoard,
  fullRows,
  gravitySeconds,
  lock,
  type Piece,
  PIECE_TYPES,
  type PieceType,
  ROTATIONS,
  ROWS,
  spawn,
  tryMove,
  tryRotate,
} from './logic';

/** Small deterministic generator so bag tests do not depend on Math.random. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function fillRow(board: Board, y: number, type: PieceType = 'I'): void {
  board[y] = Array<PieceType | null>(COLS).fill(type);
}

/** A board that is solid everywhere except the cells the piece currently occupies. */
function boxedIn(p: Piece): Board {
  const board = emptyBoard();
  for (let y = 0; y < ROWS; y++) fillRow(board, y);
  for (const { x, y } of cellsOf(p)) board[y][x] = null;
  return board;
}

describe('board and pieces', () => {
  it('emptyBoard is 22 rows by 10 columns of null, with distinct rows', () => {
    const board = emptyBoard();
    expect(board).toHaveLength(22);
    for (const row of board) {
      expect(row).toHaveLength(10);
      expect(row.every((c) => c === null)).toBe(true);
    }
    board[0][0] = 'T';
    expect(board[1][0]).toBeNull();
  });

  it('spawns pieces centred at the top without colliding', () => {
    expect(spawn('I')).toEqual({ type: 'I', rot: 0, x: 3, y: 0 });
    expect(spawn('O').x).toBe(4);
    const board = emptyBoard();
    for (const t of PIECE_TYPES) expect(collides(board, spawn(t))).toBe(false);
  });

  it('every piece has 4 rotation states of 4 cells', () => {
    for (const t of PIECE_TYPES) {
      expect(ROTATIONS[t]).toHaveLength(4);
      for (const state of ROTATIONS[t]) expect(state.flat().filter(Boolean)).toHaveLength(4);
    }
  });
});

describe('collides', () => {
  const board = emptyBoard();

  it('is true outside the left, right and bottom edges', () => {
    expect(collides(board, { type: 'O', rot: 0, x: -1, y: 5 })).toBe(true);
    expect(collides(board, { type: 'O', rot: 0, x: COLS - 1, y: 5 })).toBe(true);
    expect(collides(board, { type: 'O', rot: 0, x: 4, y: ROWS - 1 })).toBe(true);
  });

  it('is true on occupied cells', () => {
    const b = emptyBoard();
    b[6][4] = 'Z';
    expect(collides(b, { type: 'O', rot: 0, x: 4, y: 5 })).toBe(true);
  });

  it('is false for cells above the board', () => {
    expect(collides(board, { type: 'O', rot: 0, x: 4, y: -2 })).toBe(false);
  });
});

describe('tryMove', () => {
  it('returns the moved piece without mutating its input', () => {
    const p = spawn('T');
    const moved = tryMove(emptyBoard(), p, 1, 2);
    expect(moved).toEqual({ ...p, x: p.x + 1, y: p.y + 2 });
    expect(p).toEqual(spawn('T'));
  });

  it('returns null when blocked', () => {
    const p: Piece = { type: 'O', rot: 0, x: 0, y: 5 };
    expect(tryMove(emptyBoard(), p, -1, 0)).toBeNull();
    expect(p.x).toBe(0);
  });
});

describe('tryRotate', () => {
  it('returns the same object for O', () => {
    const p = spawn('O');
    expect(tryRotate(emptyBoard(), p, 1)).toBe(p);
  });

  it('rotates T both ways', () => {
    const p: Piece = { type: 'T', rot: 0, x: 4, y: 5 };
    expect(tryRotate(emptyBoard(), p, 1)?.rot).toBe(1);
    expect(tryRotate(emptyBoard(), p, -1)?.rot).toBe(3);
  });

  it('kicks off the wall and lands in bounds', () => {
    // T pointing right sits one column past the left edge of its box.
    const p: Piece = { type: 'T', rot: 1, x: -1, y: 5 };
    const board = emptyBoard();
    expect(collides(board, p)).toBe(false);
    const rotated = tryRotate(board, p, 1);
    expect(rotated).not.toBeNull();
    expect(cellsOf(rotated!).every((c) => c.x >= 0 && c.x < COLS)).toBe(true);
  });

  it('returns null when all five kicks are blocked', () => {
    const p: Piece = { type: 'T', rot: 0, x: 4, y: 10 };
    expect(tryRotate(boxedIn(p), p, 1)).toBeNull();
    expect(tryRotate(boxedIn(p), p, -1)).toBeNull();
  });

  it('uses the I kick table for I', () => {
    // Vertical I against the left wall. Only the I table's (+2, 0) kick fits; the JLSTZ kicks all fail.
    const p: Piece = { type: 'I', rot: 1, x: -2, y: 5 };
    const board = emptyBoard();
    expect(collides(board, p)).toBe(false);
    expect(tryRotate(board, p, 1)).toEqual({ type: 'I', rot: 2, x: 0, y: 5 });
  });
});

describe('dropping and locking', () => {
  it('a fresh I, O or T can fall 20 rows', () => {
    const board = emptyBoard();
    for (const t of ['I', 'O', 'T'] as const) expect(dropDistance(board, spawn(t))).toBe(20);
  });

  it('a resting piece cannot fall', () => {
    const board = emptyBoard();
    const p = spawn('T');
    expect(dropDistance(board, { ...p, y: p.y + 20 })).toBe(0);
  });

  it('lock writes the cells and reports lock-out only when entirely hidden', () => {
    const board = emptyBoard();
    expect(lock(board, spawn('O'))).toBe(true);
    expect(board[0][4]).toBe('O');
    expect(lock(emptyBoard(), { ...spawn('O'), y: 1 })).toBe(false);
  });
});

describe('line clears', () => {
  it('finds no full rows on an empty board', () => {
    expect(fullRows(emptyBoard())).toEqual([]);
  });

  it('clears one row and drops what is above it', () => {
    const board = emptyBoard();
    fillRow(board, ROWS - 1);
    board[ROWS - 2][3] = 'T';
    expect(fullRows(board)).toEqual([ROWS - 1]);
    clearRows(board, [ROWS - 1]);
    expect(board).toHaveLength(ROWS);
    expect(board[ROWS - 1][3]).toBe('T');
    expect(fullRows(board)).toEqual([]);
  });

  it('clears two separated rows and keeps 22 rows', () => {
    const board = emptyBoard();
    fillRow(board, ROWS - 1);
    fillRow(board, ROWS - 3);
    board[ROWS - 2][0] = 'L';
    board[ROWS - 4][9] = 'J';
    const rows = fullRows(board);
    expect(rows).toEqual([ROWS - 3, ROWS - 1]);
    clearRows(board, rows);
    expect(board).toHaveLength(ROWS);
    expect(board[ROWS - 1][0]).toBe('L');
    expect(board[ROWS - 2][9]).toBe('J');
    expect(board[0].every((c) => c === null)).toBe(true);
  });
});

describe('Bag', () => {
  it('deals a permutation of all seven pieces per bag', () => {
    const bag = new Bag(seeded(42));
    for (let run = 0; run < 5; run++) {
      const dealt = Array.from({ length: 7 }, () => bag.next());
      expect([...dealt].sort()).toEqual([...PIECE_TYPES].sort());
    }
  });

  it('peek does not consume and works across a refill', () => {
    const bag = new Bag(seeded(7));
    for (let i = 0; i < 5; i++) bag.next();
    const upcoming = bag.peek(6);
    expect(upcoming).toHaveLength(6);
    expect(bag.peek(6)).toEqual(upcoming);
    expect(Array.from({ length: 6 }, () => bag.next())).toEqual(upcoming);
  });
});

describe('gravitySeconds', () => {
  it('never rises with level and never drops below one frame, for levels 1 to 500', () => {
    let previous = Infinity;
    for (let level = 1; level <= 500; level++) {
      const s = gravitySeconds(level);
      expect(s).toBeGreaterThanOrEqual(1 / 60);
      expect(s).toBeLessThanOrEqual(previous);
      previous = s;
    }
  });
});
