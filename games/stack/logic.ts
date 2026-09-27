/**
 * Pure falling-block rules: pieces, SRS rotation with wall kicks, the 7-bag randomiser,
 * collision, locking and line clears. No Phaser here, so the rules are easy to reason about and test.
 */

export const COLS = 10;
/** 20 visible rows plus 2 hidden rows above the field where pieces spawn. */
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** Spawn orientation of each piece, SRS style. */
const SHAPES: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

/** Rotates a square matrix 90 degrees clockwise. */
function rotateCW(m: number[][]): number[][] {
  const n = m.length;
  return m.map((_, r) => m.map((_, c) => m[n - 1 - c][r]));
}

/** All four rotation states (0, R, 2, L) for every piece, precomputed. */
export const ROTATIONS: Record<PieceType, number[][][]> = Object.fromEntries(
  PIECE_TYPES.map((t) => {
    const states = [SHAPES[t]];
    for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1]));
    return [t, states];
  }),
) as Record<PieceType, number[][][]>;

/**
 * SRS wall kick offsets, written as (x, y) with y pointing UP as in the guideline,
 * keyed by "from>to" rotation state. They're converted to screen coordinates (y down) when used.
 */
const KICKS_JLSTZ: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

export interface Piece {
  type: PieceType;
  rot: number;
  x: number;
  y: number;
}

/** Board cells: null for empty, or the type of the piece that filled it (for color). */
export type Board = (PieceType | null)[][];

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<PieceType | null>(COLS).fill(null));
}

export function cellsOf(p: Piece): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const m = shapeOf(p);
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) if (m[r][c]) out.push({ x: p.x + c, y: p.y + r });
  return out;
}

function shapeOf(p: Piece): number[][] {
  return ROTATIONS[p.type][p.rot];
}

export function collides(board: Board, p: Piece): boolean {
  return cellsOf(p).some(({ x, y }) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x] !== null));
}

export function spawn(type: PieceType): Piece {
  const width = SHAPES[type][0].length;
  return { type, rot: 0, x: Math.floor((COLS - width) / 2), y: 0 };
}

/** Tries to move; returns the moved piece or null if blocked. */
export function tryMove(board: Board, p: Piece, dx: number, dy: number): Piece | null {
  const moved = { ...p, x: p.x + dx, y: p.y + dy };
  return collides(board, moved) ? null : moved;
}

/** Rotates with SRS wall kicks (dir 1 = clockwise, -1 = counter-clockwise). Returns null if every kick fails. */
export function tryRotate(board: Board, p: Piece, dir: 1 | -1): Piece | null {
  if (p.type === 'O') return p;
  const to = (p.rot + dir + 4) % 4;
  const table = p.type === 'I' ? KICKS_I : KICKS_JLSTZ;
  for (const [kx, ky] of table[`${p.rot}>${to}`]) {
    const candidate = { ...p, rot: to, x: p.x + kx, y: p.y - ky };
    if (!collides(board, candidate)) return candidate;
  }
  return null;
}

/** How far the piece can fall; used for the ghost piece and hard drop. */
export function dropDistance(board: Board, p: Piece): number {
  let d = 0;
  while (!collides(board, { ...p, y: p.y + d + 1 })) d++;
  return d;
}

/** Writes the piece into the board (mutates). Returns true if it locked entirely above the visible field. */
export function lock(board: Board, p: Piece): boolean {
  let allHidden = true;
  for (const { x, y } of cellsOf(p)) {
    if (y >= 0) board[y][x] = p.type;
    if (y >= HIDDEN_ROWS) allHidden = false;
  }
  return allHidden;
}

export function fullRows(board: Board): number[] {
  const rows: number[] = [];
  board.forEach((row, y) => row.every((c) => c !== null) && rows.push(y));
  return rows;
}

/** Removes the given rows and drops everything above them (mutates). */
export function clearRows(board: Board, rows: number[]): void {
  const keep = board.filter((_, y) => !rows.includes(y));
  const fresh = Array.from({ length: rows.length }, () => Array<PieceType | null>(COLS).fill(null));
  board.splice(0, board.length, ...fresh, ...keep);
}

/** 7-bag randomiser: every piece appears once per bag of seven, so droughts are impossible. */
export class Bag {
  private queue: PieceType[] = [];

  constructor(private readonly random: () => number = Math.random) {}

  next(): PieceType {
    if (this.queue.length === 0) this.refill();
    return this.queue.shift()!;
  }

  peek(n: number): PieceType[] {
    while (this.queue.length < n) this.refill();
    return this.queue.slice(0, n);
  }

  private refill(): void {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue.push(...bag);
  }
}

/** Guideline line-clear points (before the level multiplier). */
export const LINE_POINTS = [0, 100, 300, 500, 800];

/** Seconds per row of gravity at a level (guideline curve), floored at one row per frame. */
export function gravitySeconds(level: number): number {
  return Math.max(Math.pow(0.8 - (level - 1) * 0.007, level - 1), 1 / 60);
}
