import { COLS, ROWS } from './config';

/**
 * Maze layouts. Each is written as its left half, center column included; the right half is its mirror.
 * '#' wall, '.' dot, 'o' power cell, '-' chaser house door, 'G' house, 'P' runner start, ' ' open.
 * Row 9 runs off both edges as a wrap-around tunnel.
 *
 * Every layout keeps rows 6 to 12 (the chaser house, its door, the tunnel and the bonus cell) and
 * the runner's start exactly as in the first one, so the constants below hold for all of them. The
 * corridors above and below are free to change, as long as they join the middle block at columns
 * 5 and 11 on top and 5 and 7 underneath, and leave no dead ends (a chaser never turns back).
 * maze.test.ts checks every layout.
 */
const CLASSIC = [
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

const CROSSROADS = [
  '#############',
  '#o...##......',
  '#.##.##.####.',
  '#.##....#....',
  '#.##.##.#.###',
  '#...........#',
  '#####.##### #',
  '#####.#      ',
  '#####.# ####-',
  '     .  #GGGG',
  '#####.# #####',
  '#####.#      ',
  '#####.# #####',
  '#...........#',
  '#.##.#.####.#',
  '#..#.#......P',
  '##.#.#.####.#',
  '#o........#..',
  '#.####.##.#.#',
  '#............',
  '#############',
];

const mirrored = (left: readonly string[]): readonly string[] => left.map((row) => row + [...row.slice(0, COLS >> 1)].reverse().join(''));

/** Every maze, in the order the levels use them: level 1 plays the first, level 2 the second, then round again. */
export const LAYOUTS: readonly (readonly string[])[] = [CLASSIC, CROSSROADS].map(mirrored);

let active = LAYOUTS[0];

/** Switches to the maze for a level (0-based; it wraps round). tile(), open() and find() read it from then on. */
export function useLayout(index: number): void {
  const n = LAYOUTS.length;
  active = LAYOUTS[((Math.trunc(index) % n) + n) % n];
}

/** The rows of the maze in play. */
export function maze(): readonly string[] {
  return active;
}

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
  return active[y][wrapX(x)];
}

/** Open for the runner and for chasers out in the maze: everything but walls and the house door. */
export function open(x: number, y: number): boolean {
  const t = tile(x, y);
  return t !== '#' && t !== '-';
}

export function find(ch: string): { x: number; y: number } {
  for (let y = 0; y < ROWS; y++) {
    const x = active[y].indexOf(ch);
    if (x >= 0) return { x, y };
  }
  throw new Error(`maze has no '${ch}'`);
}
