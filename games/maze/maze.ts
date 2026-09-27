import { COLS, ROWS } from './config';

/**
 * The left half of the maze, center column included; the right half is its mirror.
 * '#' wall, '.' dot, 'o' power cell, '-' chaser house door, 'G' house, 'P' runner start, ' ' open.
 * Row 9 runs off both edges as a wrap-around tunnel.
 */
const LEFT = [
  '#############',
  '#...........#',
  '#o###.#####.#',
  '#............',
  '#.###.#.#####',
  '#.....#.....#',
  '#####.##### #',
  '#####.#      ',
  '#####.# ####-',
  '     .  #GGGG',
  '#####.# #####',
  '#####.#      ',
  '#####.# #####',
  '#...........#',
  '#.###.#####.#',
  '#o..#.......P',
  '###.#.#.#####',
  '#.....#.....#',
  '#.#########.#',
  '#............',
  '#############',
];

export const MAZE: readonly string[] = LEFT.map((row) => row + [...row.slice(0, COLS >> 1)].reverse().join(''));

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: readonly Dir[] = ['up', 'left', 'down', 'right'];
export const VEC: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const TUNNEL_ROW = 9;
export const DOOR = { x: 12, y: 8 };
/** The cell just above the door, where chasers enter and leave the house. */
export const HOUSE_EXIT = { x: 12, y: 7 };
export const HOUSE_Y = 9;
export const BONUS_CELL = { x: 12, y: 11 };

export function wrapX(x: number): number {
  return ((x % COLS) + COLS) % COLS;
}

export function tile(x: number, y: number): string {
  if (y < 0 || y >= ROWS) return '#';
  return MAZE[y][wrapX(x)];
}

/** Open for the runner and for chasers out in the maze: everything but walls and the house door. */
export function open(x: number, y: number): boolean {
  const t = tile(x, y);
  return t !== '#' && t !== '-';
}

export function find(ch: string): { x: number; y: number } {
  for (let y = 0; y < ROWS; y++) {
    const x = MAZE[y].indexOf(ch);
    if (x >= 0) return { x, y };
  }
  throw new Error(`maze has no '${ch}'`);
}
