import { describe, expect, it } from 'vitest';
import { createRng, dailyRng } from '../../shared/rng';
import { DIFFICULTIES, DIFFICULTY_ORDER } from './config';
import {
  type Board,
  canChord,
  cellIndex,
  chord,
  clearedCells,
  createBoard,
  minesByDistance,
  minesLeft,
  moveCursor,
  neighbors,
  placeMines,
  primary,
  reveal,
  seededBoard,
  toggleFlag,
  wrongFlags,
} from './board';

/** A board drawn as text, with its mines already down: '*' is a mine, '.' is safe. */
function boardFrom(rows: string[]): Board {
  const layout = rows.join('');
  const board = createBoard({ cols: rows[0].length, rows: rows.length, mines: [...layout].filter((c) => c === '*').length });
  for (let i = 0; i < layout.length; i++) board.mines[i] = layout[i] === '*';
  for (let i = 0; i < layout.length; i++) board.counts[i] = neighbors(board, i).filter((n) => board.mines[n]).length;
  board.placed = true;
  board.status = 'playing';
  return board;
}

const mineTotal = (b: Board) => b.mines.filter(Boolean).length;

describe('neighbors', () => {
  const b = createBoard({ cols: 4, rows: 3, mines: 0 });

  it('has three neighbors in a corner, five on an edge and eight inside', () => {
    expect(neighbors(b, 0).sort((x, y) => x - y)).toEqual([1, 4, 5]);
    expect(neighbors(b, 1)).toHaveLength(5);
    expect(neighbors(b, cellIndex(b, 1, 1))).toHaveLength(8);
    expect(neighbors(b, 11).sort((x, y) => x - y)).toEqual([6, 7, 10]);
  });

  it('never wraps around to the next row', () => {
    expect(neighbors(b, 3)).not.toContain(4);
    expect(neighbors(b, 4)).not.toContain(3);
  });
});

describe('createBoard', () => {
  it('starts hidden and unplaced, with every safe cell left', () => {
    const b = createBoard({ cols: 9, rows: 9, mines: 10 });
    expect(b.status).toBe('ready');
    expect(b.placed).toBe(false);
    expect(b.safeLeft).toBe(71);
    expect(b.revealed.some(Boolean)).toBe(false);
  });

  it('always leaves at least one safe cell', () => {
    expect(createBoard({ cols: 3, rows: 3, mines: 50 }).mineCount).toBe(8);
    expect(createBoard({ cols: 3, rows: 3, mines: -2 }).mineCount).toBe(0);
  });
});

describe('placeMines', () => {
  it('places exactly the mine count and keeps the first cell and its neighbors clear', () => {
    for (let seed = 0; seed < 40; seed++) {
      const b = createBoard({ cols: 16, rows: 16, mines: 40 });
      const safe = createRng(seed).between(0, 255);
      placeMines(b, safe, createRng(`mines-${seed}`).next);
      expect(mineTotal(b)).toBe(40);
      expect(b.mines[safe]).toBe(false);
      for (const n of neighbors(b, safe)) expect(b.mines[n]).toBe(false);
      expect(b.counts[safe]).toBe(0);
      expect(b.status).toBe('playing');
    }
  });

  it('keeps only the first cell clear when the board is too crowded for an opening', () => {
    const b = createBoard({ cols: 3, rows: 3, mines: 7 });
    placeMines(b, 4, createRng(1).next);
    expect(mineTotal(b)).toBe(7);
    expect(b.mines[4]).toBe(false);
  });

  it('counts the mines around every cell', () => {
    const b = createBoard({ cols: 10, rows: 8, mines: 20 });
    placeMines(b, 0, createRng(9).next);
    for (let i = 0; i < 80; i++) expect(b.counts[i]).toBe(neighbors(b, i).filter((n) => b.mines[n]).length);
  });

  it('copes with a random source that returns values at the very top of its range', () => {
    const b = createBoard({ cols: 5, rows: 5, mines: 6 });
    placeMines(b, 0, () => 0.9999999999);
    expect(mineTotal(b)).toBe(6);
  });

  it('does nothing once the mines are down', () => {
    const b = createBoard({ cols: 6, rows: 6, mines: 5 });
    placeMines(b, 0, createRng(2).next);
    const before = [...b.mines];
    placeMines(b, 35, createRng(3).next);
    expect(b.mines).toEqual(before);
  });

  it('places the same mines for the same seed', () => {
    const a = createBoard({ cols: 16, rows: 16, mines: 40 });
    const b = createBoard({ cols: 16, rows: 16, mines: 40 });
    placeMines(a, 17, createRng('same').next);
    placeMines(b, 17, createRng('same').next);
    expect(a.mines).toEqual(b.mines);
  });
});

describe('reveal', () => {
  it('makes the first reveal safe and opens an area around it', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const id of DIFFICULTY_ORDER) {
        const d = DIFFICULTIES[id];
        const b = createBoard(d);
        const first = createRng(seed).between(0, d.cols * d.rows - 1);
        const result = reveal(b, first, createRng(`r${seed}`).next);
        expect(result.exploded).toBe(-1);
        expect(b.status === 'playing' || b.status === 'won').toBe(true);
        // A zero always opens its neighbors too.
        expect(result.opened.length).toBeGreaterThan(neighbors(b, first).length);
      }
    }
  });

  it('opens a single numbered cell without spreading', () => {
    const b = boardFrom(['*..', '...', '...']);
    const r = reveal(b, 1);
    expect(r.opened).toEqual([{ index: 1, depth: 0 }]);
    expect(b.counts[1]).toBe(1);
  });

  it('floods through zeros and stops at the numbered border', () => {
    const b = boardFrom(['....', '....', '...*']);
    const r = reveal(b, 0);
    // Everything but the mine is uncovered, and that wins the board.
    expect(r.opened).toHaveLength(11);
    expect(b.status).toBe('won');
    // Further rings are deeper in the wave.
    expect(r.opened[0]).toEqual({ index: 0, depth: 0 });
    expect(Math.max(...r.opened.map((o) => o.depth))).toBeGreaterThan(1);
  });

  it('opens every cell once, in order of depth', () => {
    const b = boardFrom(['.....', '.....', '..*..', '.....', '.....', '.....']);
    const r = reveal(b, cellIndex(b, 0, 5));
    const indexes = r.opened.map((o) => o.index);
    expect(new Set(indexes).size).toBe(indexes.length);
    for (let i = 1; i < r.opened.length; i++) expect(r.opened[i].depth).toBeGreaterThanOrEqual(r.opened[i - 1].depth);
  });

  it('does not flood past a flag', () => {
    const b = boardFrom(['.....', '.....', '....*']);
    toggleFlag(b, 2);
    const r = reveal(b, 0);
    expect(b.revealed[2]).toBe(false);
    expect(r.opened.map((o) => o.index)).not.toContain(2);
    expect(b.status).toBe('playing');
  });

  it('loses on a mine and marks which one went off', () => {
    const b = boardFrom(['*.*', '...', '...']);
    reveal(b, 1);
    const r = reveal(b, 0);
    expect(r.exploded).toBe(0);
    expect(b.status).toBe('lost');
    expect(b.exploded).toBe(0);
  });

  it('ignores flagged, uncovered cells and finished boards', () => {
    const b = boardFrom(['*.*', '...', '...']);
    reveal(b, 1);
    expect(reveal(b, 1).opened).toEqual([]);
    toggleFlag(b, 3);
    expect(reveal(b, 3).opened).toEqual([]);
    expect(b.revealed[3]).toBe(false);
    reveal(b, 0);
    expect(reveal(b, 7).opened).toEqual([]);
    expect(b.revealed[7]).toBe(false);
  });

  it('wins once every safe cell is uncovered, and flags every mine', () => {
    const b = boardFrom(['*.', '..']);
    reveal(b, 1);
    reveal(b, 2);
    expect(b.status).toBe('playing');
    reveal(b, 3);
    expect(b.status).toBe('won');
    expect(b.flagged[0]).toBe(true);
    expect(minesLeft(b)).toBe(0);
  });
});

describe('flags', () => {
  it('toggles on hidden cells and keeps the count', () => {
    const b = boardFrom(['*..', '...', '...']);
    expect(toggleFlag(b, 0)).toBe(true);
    expect(b.flags).toBe(1);
    expect(minesLeft(b)).toBe(0);
    expect(toggleFlag(b, 0)).toBe(true);
    expect(b.flags).toBe(0);
  });

  it('can count past the number of mines', () => {
    const b = boardFrom(['*..', '...', '...']);
    toggleFlag(b, 1);
    toggleFlag(b, 2);
    expect(minesLeft(b)).toBe(-1);
  });

  it('cannot flag an uncovered cell or a finished board', () => {
    const b = boardFrom(['*..', '...', '...']);
    reveal(b, 1);
    expect(toggleFlag(b, 1)).toBe(false);
    reveal(b, 0);
    expect(toggleFlag(b, 2)).toBe(false);
  });

  it('can be placed before the first reveal', () => {
    const b = createBoard({ cols: 5, rows: 5, mines: 3 });
    expect(toggleFlag(b, 0)).toBe(true);
  });

  it('lists the flags that were wrong', () => {
    const b = boardFrom(['*..', '...', '..*']);
    toggleFlag(b, 0);
    toggleFlag(b, 4);
    expect(wrongFlags(b)).toEqual([4]);
  });
});

describe('chord', () => {
  it('opens the other neighbors when the flags match the number', () => {
    const b = boardFrom(['*..', '...', '...', '...']);
    reveal(b, 4);
    expect(canChord(b, 4)).toBe(false);
    toggleFlag(b, 0);
    expect(canChord(b, 4)).toBe(true);
    const r = chord(b, 4);
    expect(r.exploded).toBe(-1);
    expect(r.opened.length).toBeGreaterThan(0);
    expect(b.status).toBe('won');
  });

  it('does nothing when the flags do not match the number', () => {
    const b = boardFrom(['*.*', '...', '...']);
    reveal(b, 4);
    toggleFlag(b, 0);
    expect(chord(b, 4)).toEqual({ opened: [], exploded: -1 });
    expect(b.revealed[1]).toBe(false);
  });

  it('loses when a flag was wrong', () => {
    const b = boardFrom(['*..', '...', '...']);
    reveal(b, 4);
    toggleFlag(b, 1);
    const r = chord(b, 4);
    expect(r.exploded).toBe(0);
    expect(b.status).toBe('lost');
  });

  it('does nothing on a hidden cell or a zero', () => {
    const b = boardFrom(['....', '....', '...*']);
    expect(chord(b, 0).opened).toEqual([]);
    reveal(b, 0);
    expect(chord(b, 0).opened).toEqual([]);
  });

  it('is what the main action does on an uncovered number', () => {
    const b = boardFrom(['*..', '...', '...', '...']);
    primary(b, 4);
    toggleFlag(b, 0);
    primary(b, 4);
    expect(b.status).toBe('won');
  });
});

describe('seededBoard', () => {
  it('gives every player the same daily board and start, which opens an area', () => {
    const d = DIFFICULTIES.medium;
    const a = seededBoard(d, dailyRng('mines', '2026-11-15', 'board').next);
    const b = seededBoard(d, dailyRng('mines', '2026-11-15', 'board').next);
    expect(a.start).toBe(b.start);
    expect(a.board.mines).toEqual(b.board.mines);
    expect(mineTotal(a.board)).toBe(d.mines);
    expect(a.board.counts[a.start]).toBe(0);
    expect(reveal(a.board, a.start).opened.length).toBeGreaterThan(1);
  });

  it('differs from day to day', () => {
    const d = DIFFICULTIES.medium;
    const a = seededBoard(d, dailyRng('mines', '2026-11-15', 'board').next);
    const b = seededBoard(d, dailyRng('mines', '2026-11-16', 'board').next);
    expect(a.board.mines).not.toEqual(b.board.mines);
  });
});

describe('helpers', () => {
  it('counts cleared cells', () => {
    const b = boardFrom(['*.*', '...', '...']);
    expect(clearedCells(b)).toBe(0);
    reveal(b, 1);
    reveal(b, 4);
    expect(clearedCells(b)).toBe(2);
  });

  it('orders mines nearest first from the one that went off', () => {
    const b = boardFrom(['*...*', '.....', '.*...']);
    expect(minesByDistance(b, 0)).toEqual([0, cellIndex(b, 1, 2), 4]);
  });

  it('moves the cursor and stops at the edges', () => {
    const b = createBoard({ cols: 4, rows: 3, mines: 0 });
    expect(moveCursor(b, 0, -1, 0)).toBe(0);
    expect(moveCursor(b, 0, 0, -1)).toBe(0);
    expect(moveCursor(b, 0, 1, 1)).toBe(5);
    expect(moveCursor(b, 11, 1, 1)).toBe(11);
    expect(moveCursor(b, 3, 1, 0)).toBe(3);
  });
});
