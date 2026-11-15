/**
 * Neon Mines board rules: mine placement with a safe first reveal, neighbor counts, flood reveal,
 * flags, chording and win or loss. Cells are numbered row by row (index = row * cols + col). No
 * Phaser here, so the rules are tested on their own.
 */

export interface BoardSize {
  cols: number;
  rows: number;
  mines: number;
}

/** 'ready' until the mines are placed by the first reveal, then 'playing' until it is won or lost. */
export type Status = 'ready' | 'playing' | 'won' | 'lost';

export interface Board {
  readonly cols: number;
  readonly rows: number;
  readonly mineCount: number;
  mines: boolean[];
  /** How many of each cell's neighbors are mines. */
  counts: number[];
  revealed: boolean[];
  flagged: boolean[];
  placed: boolean;
  status: Status;
  /** Safe cells still hidden; the board is won when this reaches 0. */
  safeLeft: number;
  flags: number;
  /** The mine that went off, or -1. */
  exploded: number;
}

/** A cell uncovered by a move, and how many steps from where the move started (for the reveal wave). */
export interface Opened {
  index: number;
  depth: number;
}

export interface MoveResult {
  opened: Opened[];
  /** The mine the move set off, or -1. */
  exploded: number;
}

const NOTHING: MoveResult = { opened: [], exploded: -1 };

export function createBoard({ cols, rows, mines }: BoardSize): Board {
  const size = cols * rows;
  // There must always be at least one safe cell for the first reveal.
  const mineCount = Math.max(0, Math.min(Math.floor(mines), size - 1));
  return {
    cols,
    rows,
    mineCount,
    mines: new Array<boolean>(size).fill(false),
    counts: new Array<number>(size).fill(0),
    revealed: new Array<boolean>(size).fill(false),
    flagged: new Array<boolean>(size).fill(false),
    placed: false,
    status: 'ready',
    safeLeft: size - mineCount,
    flags: 0,
    exploded: -1,
  };
}

export function cellIndex(board: Pick<Board, 'cols'>, col: number, row: number): number {
  return row * board.cols + col;
}

/** The up to eight cells around a cell. */
export function neighbors(board: Pick<Board, 'cols' | 'rows'>, index: number): number[] {
  const col = index % board.cols;
  const row = Math.floor(index / board.cols);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const c = col + dc;
      const r = row + dr;
      if (c >= 0 && c < board.cols && r >= 0 && r < board.rows) out.push(r * board.cols + c);
    }
  }
  return out;
}

/**
 * Places the mines, keeping `safe` and the cells around it clear so the first reveal opens an area.
 * On a board too crowded for that, only `safe` itself is kept clear. `rand` works like Math.random;
 * pass a seeded one for a board that must be the same every time.
 */
export function placeMines(board: Board, safe: number, rand: () => number): void {
  if (board.placed) return;
  const size = board.cols * board.rows;
  const clear = new Set([safe, ...neighbors(board, safe)]);
  let pool: number[] = [];
  for (let i = 0; i < size; i++) if (!clear.has(i)) pool.push(i);
  if (pool.length < board.mineCount) {
    pool = [];
    for (let i = 0; i < size; i++) if (i !== safe) pool.push(i);
  }
  // A partial Fisher-Yates shuffle: the first mineCount cells of the pool become mines.
  for (let i = 0; i < board.mineCount; i++) {
    const j = i + Math.min(pool.length - i - 1, Math.floor(rand() * (pool.length - i)));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    board.mines[pool[i]] = true;
  }
  for (let i = 0; i < size; i++) board.counts[i] = neighbors(board, i).filter((n) => board.mines[n]).length;
  board.placed = true;
  board.status = 'playing';
}

/**
 * A board whose mines are all placed from `rand`, with its own safe starting cell (the middle of an
 * opening) for the game to reveal first. With a seeded `rand` every player gets the same board and
 * the same start, which a first-click-safe board could not promise.
 */
export function seededBoard(size: BoardSize, rand: () => number): { board: Board; start: number } {
  const board = createBoard(size);
  const start = Math.min(size.cols * size.rows - 1, Math.floor(rand() * size.cols * size.rows));
  placeMines(board, start, rand);
  return { board, start };
}

function over(board: Board): boolean {
  return board.status === 'won' || board.status === 'lost';
}

/** Uncovers safe cells from `starts`, spreading through every cell with no mines around it. */
function flood(board: Board, starts: number[]): Opened[] {
  const opened: Opened[] = [];
  const queue: Opened[] = [];
  for (const index of starts) {
    if (board.revealed[index] || board.flagged[index] || board.mines[index]) continue;
    board.revealed[index] = true;
    queue.push({ index, depth: 0 });
  }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    opened.push(cell);
    board.safeLeft--;
    if (board.counts[cell.index] !== 0) continue;
    for (const n of neighbors(board, cell.index)) {
      // A zero's neighbors are never mines; flagged cells are left for the player to judge.
      if (board.revealed[n] || board.flagged[n]) continue;
      board.revealed[n] = true;
      queue.push({ index: n, depth: cell.depth + 1 });
    }
  }
  if (board.safeLeft === 0) win(board);
  return opened;
}

function win(board: Board): void {
  board.status = 'won';
  // Every mine is known now, so they are all shown flagged. (A flagged safe cell is still hidden, so
  // it cannot be there on a won board.)
  for (let i = 0; i < board.mines.length; i++) if (board.mines[i]) board.flagged[i] = true;
  board.flags = board.mineCount;
}

function lose(board: Board, mine: number): MoveResult {
  board.status = 'lost';
  board.exploded = mine;
  return { opened: [], exploded: mine };
}

/**
 * Reveals a hidden cell. The first reveal of a board places the mines around it first (see
 * placeMines), so it is always safe. Flagged and uncovered cells are left alone.
 */
export function reveal(board: Board, index: number, rand: () => number = Math.random): MoveResult {
  if (over(board) || board.revealed[index] || board.flagged[index]) return NOTHING;
  if (!board.placed) placeMines(board, index, rand);
  if (board.mines[index]) return lose(board, index);
  return { opened: flood(board, [index]), exploded: -1 };
}

/**
 * Chording: on an uncovered number with exactly that many flags around it, reveals every other
 * neighbor at once. A wrong flag means one of them is a mine, and the board is lost.
 */
export function chord(board: Board, index: number): MoveResult {
  if (board.status !== 'playing' || !board.revealed[index] || board.counts[index] === 0) return NOTHING;
  const around = neighbors(board, index);
  if (around.filter((n) => board.flagged[n]).length !== board.counts[index]) return NOTHING;
  const targets = around.filter((n) => !board.revealed[n] && !board.flagged[n]);
  const mine = targets.find((n) => board.mines[n]);
  if (mine !== undefined) return lose(board, mine);
  return { opened: flood(board, targets), exploded: -1 };
}

/** The main action on a cell: reveal it if hidden, chord it if it is an uncovered number. */
export function primary(board: Board, index: number, rand: () => number = Math.random): MoveResult {
  return board.revealed[index] ? chord(board, index) : reveal(board, index, rand);
}

/** True if a chord on this cell would do something: a number with all its flags placed and cells left to open. */
export function canChord(board: Board, index: number): boolean {
  if (board.status !== 'playing' || !board.revealed[index] || board.counts[index] === 0) return false;
  const around = neighbors(board, index);
  return around.filter((n) => board.flagged[n]).length === board.counts[index] && around.some((n) => !board.revealed[n] && !board.flagged[n]);
}

/** Flags or unflags a hidden cell. Returns true if it changed. */
export function toggleFlag(board: Board, index: number): boolean {
  if (over(board) || board.revealed[index]) return false;
  board.flagged[index] = !board.flagged[index];
  board.flags += board.flagged[index] ? 1 : -1;
  return true;
}

/** Mines not yet accounted for by a flag, as the HUD counts them. Negative when there are too many flags. */
export function minesLeft(board: Board): number {
  return board.mineCount - board.flags;
}

/** How many safe cells have been uncovered. */
export function clearedCells(board: Board): number {
  return board.cols * board.rows - board.mineCount - board.safeLeft;
}

/** Every mine, nearest to `from` first (for the chain of explosions on a loss). */
export function minesByDistance(board: Board, from: number): number[] {
  const fc = from % board.cols;
  const fr = Math.floor(from / board.cols);
  const dist = (i: number) => Math.hypot((i % board.cols) - fc, Math.floor(i / board.cols) - fr);
  const out: number[] = [];
  for (let i = 0; i < board.mines.length; i++) if (board.mines[i]) out.push(i);
  return out.sort((a, b) => dist(a) - dist(b) || a - b);
}

/** Flags on cells that were not mines, to mark after a loss. */
export function wrongFlags(board: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.flagged.length; i++) if (board.flagged[i] && !board.mines[i]) out.push(i);
  return out;
}

/** Moves a cursor by one step, stopping at the edges. */
export function moveCursor(board: Pick<Board, 'cols' | 'rows'>, index: number, dc: number, dr: number): number {
  const col = Math.max(0, Math.min(board.cols - 1, (index % board.cols) + dc));
  const row = Math.max(0, Math.min(board.rows - 1, Math.floor(index / board.cols) + dr));
  return row * board.cols + col;
}
