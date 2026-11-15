import { describe, expect, it } from 'vitest';
import {
  allMoves,
  areAdjacent,
  blastArea,
  type Board,
  BOARD_SIZE,
  boardFrom,
  clearMatches,
  cloneBoard,
  collapse,
  colorRows,
  fillBoard,
  findMatches,
  findMove,
  findRuns,
  GEM_COLORS,
  GEM_POINTS,
  isValidSwap,
  reshuffle,
  resolveAll,
  SPECIAL_POINTS,
  specialSpot,
  step,
  stepPoints,
  swapGems,
} from './rules';
import { parseBests, withScore } from './best';
import { createRng } from '../../shared/rng';

/** Always the first color, for refills whose colors a test does not care about. */
const zero = () => 0;

function ids(board: Board): number[] {
  return board.grid.flat().map((g) => g?.id ?? 0);
}

describe('boardFrom', () => {
  it('reads colors, specials and gaps', () => {
    const b = boardFrom(['01h', '2b.', '3v4']);
    expect(colorRows(b)).toEqual(['01.', '2..', '34.']);
    expect(b.grid[0][1]!.special).toBe('lineH');
    expect(b.grid[1][0]!.special).toBe('bomb');
    expect(b.grid[1][1]).toBeNull();
    expect(b.grid[2][0]!.special).toBe('lineV');
    expect(b.grid[2][1]!.special).toBe('none');
    expect(new Set(ids(b).filter(Boolean)).size).toBe(5);
  });
});

describe('fillBoard', () => {
  it('is the same for the same seed', () => {
    expect(colorRows(fillBoard(createRng('a').next))).toEqual(colorRows(fillBoard(createRng('a').next)));
    expect(colorRows(fillBoard(createRng('a').next))).not.toEqual(colorRows(fillBoard(createRng('b').next)));
  });

  it('deals a full board with no starting match and at least one move', () => {
    for (let seed = 0; seed < 200; seed++) {
      const b = fillBoard(createRng(seed).next);
      expect(b.grid.length).toBe(BOARD_SIZE);
      expect(b.grid.flat().every((g) => g && g.color >= 0 && g.color < GEM_COLORS && g.special === 'none')).toBe(true);
      expect(findRuns(b)).toEqual([]);
      expect(findMove(b)).not.toBeNull();
    }
  });

  it('uses every color and unique ids', () => {
    const b = fillBoard(createRng(7).next);
    expect(new Set(b.grid.flat().map((g) => g!.color)).size).toBe(GEM_COLORS);
    expect(new Set(ids(b)).size).toBe(BOARD_SIZE * BOARD_SIZE);
  });
});

describe('matching', () => {
  it('finds lines of three across and down, and ignores pairs', () => {
    const runs = findRuns(boardFrom(['0001', '2324', '2534', '2112']));
    expect(runs).toEqual([
      { dir: 'h', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] },
      { dir: 'v', cells: [{ r: 1, c: 0 }, { r: 2, c: 0 }, { r: 3, c: 0 }] },
    ]);
  });

  it('finds a run that reaches the edge and skips empty cells', () => {
    expect(findRuns(boardFrom(['0111', '2.23', '3232', '2323']))).toEqual([{ dir: 'h', cells: [{ r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }] }]);
  });

  it('a line of three makes nothing special', () => {
    const [g] = findMatches(boardFrom(['111', '203', '320']));
    expect(g.makes).toBe('none');
    expect(g.cells).toHaveLength(3);
    expect(g.color).toBe(1);
  });

  it('four across makes a row blaster, four down a column blaster', () => {
    expect(findMatches(boardFrom(['1111', '2323', '3232', '2323']))[0].makes).toBe('lineH');
    expect(findMatches(boardFrom(['1232', '1323', '1232', '1323']))[0].makes).toBe('lineV');
  });

  it('five in a line makes a bomb', () => {
    const [g] = findMatches(boardFrom(['22222', '01010', '10101', '01010', '10101']));
    expect(g.makes).toBe('bomb');
    expect(g.cells).toHaveLength(5);
    expect(specialSpot(g)).toEqual({ r: 0, c: 2 });
  });

  it('joins an L into one group that makes a bomb at the corner', () => {
    const groups = findMatches(boardFrom(['3012', '3120', '3330', '0121']));
    expect(groups).toHaveLength(1);
    expect(groups[0].makes).toBe('bomb');
    expect(groups[0].cells).toHaveLength(5);
    expect(specialSpot(groups[0])).toEqual({ r: 2, c: 0 });
  });

  it('joins a T and puts its bomb where the lines cross', () => {
    const groups = findMatches(boardFrom(['44401', '04123', '14012', '20123', '01201']));
    expect(groups).toHaveLength(1);
    expect(groups[0].makes).toBe('bomb');
    expect(specialSpot(groups[0])).toEqual({ r: 0, c: 1 });
  });

  it('keeps separate matches separate, even of the same color', () => {
    expect(findMatches(boardFrom(['1112', '2323', '3232', '1113']))).toHaveLength(2);
  });

  it('puts the special where the player moved a gem, if it is in the match', () => {
    const [g] = findMatches(boardFrom(['1111', '2323', '3232', '2323']));
    expect(specialSpot(g, [{ r: 1, c: 3 }, { r: 0, c: 3 }])).toEqual({ r: 0, c: 3 });
    expect(specialSpot(g)).toEqual({ r: 0, c: 1 });
  });
});

describe('swaps', () => {
  const board = () => boardFrom(['0010', '1223', '2134', '3401']);

  it('only allows neighbours', () => {
    expect(areAdjacent({ r: 1, c: 1 }, { r: 1, c: 2 })).toBe(true);
    expect(areAdjacent({ r: 1, c: 1 }, { r: 0, c: 1 })).toBe(true);
    expect(areAdjacent({ r: 1, c: 1 }, { r: 2, c: 2 })).toBe(false);
    expect(areAdjacent({ r: 1, c: 1 }, { r: 1, c: 3 })).toBe(false);
    expect(areAdjacent({ r: 1, c: 1 }, { r: 1, c: 1 })).toBe(false);
  });

  it('accepts a swap that makes a line and rejects one that does not, leaving the board as it was', () => {
    const b = board();
    const before = colorRows(b);
    expect(isValidSwap(b, { r: 0, c: 2 }, { r: 0, c: 3 })).toBe(true);
    expect(isValidSwap(b, { r: 3, c: 0 }, { r: 3, c: 1 })).toBe(false);
    expect(isValidSwap(b, { r: 0, c: 0 }, { r: 2, c: 2 })).toBe(false);
    expect(colorRows(b)).toEqual(before);
  });

  it('rejects swaps off the board or with an empty cell', () => {
    expect(isValidSwap(board(), { r: 0, c: 3 }, { r: 0, c: 4 })).toBe(false);
    expect(isValidSwap(board(), { r: -1, c: 0 }, { r: 0, c: 0 })).toBe(false);
    expect(isValidSwap(boardFrom(['0.0', '101', '232']), { r: 1, c: 1 }, { r: 0, c: 1 })).toBe(false);
  });

  it('counts a match made by either gem of the swap', () => {
    // Swapping the middle-left pair lines up 2s down column 0 and 0s down column 1.
    const b = boardFrom(['2034', '0215', '2043', '5134']);
    expect(findRuns(b)).toEqual([]);
    expect(isValidSwap(b, { r: 1, c: 0 }, { r: 1, c: 1 })).toBe(true);
    swapGems(b, { r: 1, c: 0 }, { r: 1, c: 1 });
    expect(findMatches(b).map((g) => g.color)).toEqual([2, 0]);
  });
});

describe('move detection', () => {
  it('finds a move when there is one and none on a dead board', () => {
    expect(findMove(boardFrom(['0010', '1223', '2134', '3401']))).toEqual([
      { r: 0, c: 2 },
      { r: 0, c: 3 },
    ]);
    const dead = boardFrom(['0123', '2301', '0123', '2301']);
    expect(findMove(dead)).toBeNull();
    expect(allMoves(dead)).toEqual([]);
  });

  it('every move it lists really makes a match', () => {
    const b = fillBoard(createRng(3).next);
    const moves = allMoves(b);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves[0]).toEqual(findMove(b));
    for (const [a, c] of moves) {
      const copy = cloneBoard(b);
      swapGems(copy, a, c);
      expect(findMatches(copy).length).toBeGreaterThan(0);
    }
  });

  it('clones deeply, so trying moves never changes the original', () => {
    const b = boardFrom(['01', '10']);
    const copy = cloneBoard(b);
    copy.grid[0][0]!.color = 5;
    swapGems(copy, { r: 1, c: 0 }, { r: 1, c: 1 });
    expect(colorRows(b)).toEqual(['01', '10']);
  });
});

describe('clearing and blasts', () => {
  it('clears a plain match and scores it', () => {
    const b = boardFrom(['111', '203', '320']);
    const r = clearMatches(b, 1)!;
    expect(r.cleared).toHaveLength(3);
    expect(r.created).toEqual([]);
    expect(r.blasts).toEqual([]);
    expect(r.points).toBe(3 * GEM_POINTS);
    expect(colorRows(b)).toEqual(['...', '203', '320']);
  });

  it('returns null when nothing matches', () => {
    const b = boardFrom(['012', '120', '201']);
    expect(clearMatches(b, 1)).toBeNull();
    expect(step(b, zero, 1)).toBeNull();
    expect(resolveAll(b, zero)).toEqual([]);
  });

  it('leaves a line gem where the four was made', () => {
    const b = boardFrom(['1111', '2323', '3232', '2323']);
    const r = clearMatches(b, 1, [{ r: 0, c: 2 }])!;
    expect(r.created).toHaveLength(1);
    expect(r.created[0].pos).toEqual({ r: 0, c: 2 });
    expect(b.grid[0][2]).toMatchObject({ color: 1, special: 'lineH' });
    expect(colorRows(b)[0]).toBe('..1.');
    expect(r.points).toBe(4 * GEM_POINTS + SPECIAL_POINTS.lineH);
  });

  it('leaves a bomb for an L', () => {
    const b = boardFrom(['3012', '3120', '3330', '0121']);
    const r = clearMatches(b, 2)!;
    expect(r.created.map((c) => c.gem.special)).toEqual(['bomb']);
    expect(b.grid[2][0]).toMatchObject({ color: 3, special: 'bomb' });
    expect(r.points).toBe((5 * GEM_POINTS + SPECIAL_POINTS.bomb) * 2);
  });

  it('a row blaster in a match clears its whole row', () => {
    const b = boardFrom(['0123', '11h12', '2301', '3012']);
    const r = clearMatches(b, 1)!;
    expect(r.blasts.map((x) => x.gem.special)).toEqual(['lineH']);
    expect(r.cleared).toHaveLength(4);
    expect(colorRows(b)).toEqual(['0123', '....', '2301', '3012']);
  });

  it('a column blaster clears its column beyond the match', () => {
    const b = boardFrom(['0123', '22v23', '3012', '1230']);
    const r = clearMatches(b, 1)!;
    expect(r.cleared).toHaveLength(6);
    expect(colorRows(b)).toEqual(['0.23', '...3', '3.12', '1.30']);
  });

  it('a bomb clears the 3x3 around it and sets off a special caught in the blast', () => {
    const b = boardFrom(['01230', '111b24', '2300v2', '30124', '41203']);
    const r = clearMatches(b, 1)!;
    expect(r.blasts.map((x) => x.gem.special)).toEqual(['bomb', 'lineV']);
    expect(colorRows(b)).toEqual(['0...0', '....4', '2...2', '301.4', '412.3']);
    expect(r.points).toBe(r.cleared.length * GEM_POINTS);
  });

  it('blast areas stay on the board', () => {
    const b = boardFrom(['012', '120', '201']);
    expect(blastArea(b, { r: 0, c: 0 }, 'bomb')).toHaveLength(4);
    expect(blastArea(b, { r: 1, c: 1 }, 'bomb')).toHaveLength(9);
    expect(blastArea(b, { r: 2, c: 0 }, 'lineH')).toEqual([
      { r: 2, c: 0 },
      { r: 2, c: 1 },
      { r: 2, c: 2 },
    ]);
    expect(blastArea(b, { r: 2, c: 1 }, 'lineV')).toHaveLength(3);
    expect(blastArea(b, { r: 2, c: 0 }, 'none')).toEqual([]);
  });
});

describe('gravity and refill', () => {
  it('drops gems into gaps and fills from the top, keeping ids', () => {
    const b = boardFrom(['014', '.25', '3.6']);
    const top = b.grid[0][1]!.id;
    const falls = collapse(b, zero);
    expect(colorRows(b)).toEqual(['004', '015', '326']);
    expect(b.grid[1][1]!.id).toBe(top);
    expect(falls.find((f) => f.gem.id === top)).toMatchObject({ col: 1, fromRow: 0, toRow: 1 });
    // The new gem in column 0 starts one row above the board.
    expect(falls.filter((f) => f.col === 0 && f.fromRow < 0)).toEqual([expect.objectContaining({ fromRow: -1, toRow: 0 })]);
  });

  it('new gems in one column stack above the board in landing order', () => {
    const b = boardFrom(['0123', '.230', '.301', '1012']);
    const fresh = collapse(b, zero)
      .filter((f) => f.fromRow < 0 && f.col === 0)
      .sort((x, y) => x.toRow - y.toRow);
    expect(fresh.map((f) => [f.fromRow, f.toRow])).toEqual([
      [-2, 0],
      [-1, 1],
    ]);
  });

  it('leaves a full board alone', () => {
    const b = boardFrom(['01', '10']);
    expect(collapse(b, zero)).toEqual([]);
  });
});

describe('cascades and scoring', () => {
  it('multiplies points by the chain', () => {
    expect(stepPoints(3, [], 1)).toBe(30);
    expect(stepPoints(3, [], 3)).toBe(90);
    expect(stepPoints(4, ['lineV'], 2)).toBe((40 + SPECIAL_POINTS.lineV) * 2);
    expect(stepPoints(5, ['bomb', 'none'], 0)).toBe(50 + SPECIAL_POINTS.bomb);
  });

  it('chains a cascade when falling gems line up', () => {
    // Clearing the 2s in column 0 drops the 1 onto row 3, beside two more 1s.
    const b = boardFrom(['1340', '2403', '2034', '2115']);
    const steps = resolveAll(b, createRng(9).next);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps[0].groups.map((g) => g.color)).toEqual([2]);
    expect(steps[1].groups.some((g) => g.color === 1)).toBe(true);
    steps.forEach((s, i) => expect(s.chain).toBe(i + 1));
    expect(steps[1].points).toBe(
      stepPoints(
        steps[1].cleared.length,
        steps[1].created.map((c) => c.gem.special),
        2,
      ),
    );
    expect(findRuns(b)).toEqual([]);
  });

  it('a seeded game settles after every move with a full board and no matches left', () => {
    const rng = createRng('cascade');
    const b = fillBoard(rng.next);
    for (let turn = 0; turn < 60; turn++) {
      const move = findMove(b);
      if (!move) {
        reshuffle(b, rng.next);
        continue;
      }
      swapGems(b, move[0], move[1]);
      const steps = resolveAll(b, rng.next, move);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.reduce((sum, s) => sum + s.points, 0)).toBeGreaterThanOrEqual(3 * GEM_POINTS);
      expect(b.grid.flat().every(Boolean)).toBe(true);
      expect(findRuns(b)).toEqual([]);
      expect(new Set(ids(b)).size).toBe(BOARD_SIZE * BOARD_SIZE);
    }
  });
});

describe('reshuffle', () => {
  it('turns a dead board into one with a move and no matches, keeping the same gems', () => {
    const b = boardFrom(['01234', '23401', '40123', '12340', '34012']);
    expect(findMove(b)).toBeNull();
    const before = ids(b).sort((x, y) => x - y);
    reshuffle(b, createRng(1).next);
    expect(findMove(b)).not.toBeNull();
    expect(findRuns(b)).toEqual([]);
    expect(ids(b).sort((x, y) => x - y)).toEqual(before);
  });

  it('deals a fresh board with new ids when no shuffle can work', () => {
    // Every gem a different color: no arrangement has a move.
    const b = boardFrom(['012', '345', '678'], 9);
    const old = new Set(ids(b));
    reshuffle(b, createRng(2).next, 5);
    expect(findMove(b)).not.toBeNull();
    expect(ids(b).some((id) => old.has(id))).toBe(false);
    expect(Math.max(...ids(b))).toBeLessThan(b.nextId);
  });
});

describe('mode bests', () => {
  it('reads only well-formed scores', () => {
    expect(parseBests(null)).toEqual({ timed: 0, moves: 0 });
    expect(parseBests([1, 2])).toEqual({ timed: 0, moves: 0 });
    expect(parseBests({ timed: 120, moves: 'x' })).toEqual({ timed: 120, moves: 0 });
  });

  it('keeps the higher score per mode', () => {
    const start = { timed: 500, moves: 300 };
    expect(withScore(start, 'timed', 400)).toEqual({ bests: start, isBest: false });
    expect(withScore(start, 'timed', 500).isBest).toBe(false);
    expect(withScore(start, 'moves', 301)).toEqual({ bests: { timed: 500, moves: 301 }, isBest: true });
  });
});
