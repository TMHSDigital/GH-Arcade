import { CELL, COLS, ROWS } from './config';

/**
 * The nine holes, drawn as text. No Phaser here, so the parser and the layouts are tested directly.
 *
 *   ' ' out of bounds     '#' wall      '.' green      's' sand (slows the ball)
 *   'T' tee (one)         'O' cup (one) 'w' water (penalty stroke, the ball goes back)
 *   '>' '<' '^' 'v' boost pads that push the ball along the arrow
 *
 * A layout is up to 20 columns by 13 rows; shorter rows and missing rows are out of bounds. The
 * ball can never leave the grid, as anything past its edges counts as wall. holes.test.ts checks
 * every layout, and plays each one with a brute-force golfer to make sure par can be made.
 */

/** A blocker that slides back and forth: a rectangle in px on the grid, moving by (dx, dy) and back once per period. */
export interface MoverDef {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  /** Seconds for a full trip out and back. */
  period: number;
  /** Where in its trip it starts, 0 to 1. */
  phase?: number;
}

export interface HoleDef {
  name: string;
  par: number;
  rows: readonly string[];
  movers?: readonly MoverDef[];
}

export const HOLES: readonly HoleDef[] = [
  {
    name: 'FIRST LIGHT',
    par: 2,
    rows: [
      '',
      '',
      '  ################',
      '  #..............#',
      '  #..............#',
      '  #..#........#..#',
      '  #.T..........O.#',
      '  #..#........#..#',
      '  #..............#',
      '  #..............#',
      '  ################',
    ],
  },
  {
    name: 'DOGLEG',
    par: 3,
    rows: [
      '',
      ' ##########',
      ' #........#',
      ' #.T......#',
      ' #........#',
      ' #####....#########',
      '     #............#',
      '     #............#',
      '     #.........O..#',
      '     #............#',
      '     ##############',
    ],
  },
  {
    name: 'BUNKER',
    par: 3,
    rows: [
      '',
      '',
      '  ################',
      '  #..............#',
      '  #......ss......#',
      '  #.....ssss.....#',
      '  #.T...ssss..O..#',
      '  #.....ssss.....#',
      '  #......ss......#',
      '  #..............#',
      '  ################',
    ],
  },
  {
    name: 'CROSSING',
    par: 3,
    rows: [
      '',
      ' ##################',
      ' #......wwww......#',
      ' #......wwww......#',
      ' #.T....wwww....O.#',
      ' #......wwww......#',
      ' #................#',
      ' #................#',
      ' #................#',
      ' ##################',
    ],
  },
  {
    name: 'BOOST GATE',
    par: 3,
    rows: [
      '',
      ' ##################',
      ' #..........#.....#',
      ' #..........#..O..#',
      ' #..........#.....#',
      ' #..######..#.....#',
      ' #..#    #..#^^^^^#',
      ' #..######..#^^^^^#',
      ' #..........#.....#',
      ' #.T........>>....#',
      ' #..........>>....#',
      ' ##################',
    ],
  },
  {
    name: 'SLIDERS',
    par: 3,
    rows: [
      '',
      '',
      ' ##################',
      ' #................#',
      ' #................#',
      ' #.T............O.#',
      ' #................#',
      ' #................#',
      ' ##################',
    ],
    // Two bars sweep up and down across the fairway, out of step, always leaving a gap at one end.
    movers: [
      { x: 292, y: 144, w: 16, h: 80, dx: 0, dy: 72, period: 2.4 },
      { x: 492, y: 144, w: 16, h: 80, dx: 0, dy: 72, period: 2, phase: 0.5 },
    ],
  },
  {
    name: 'SWITCHBACK',
    par: 5,
    rows: [
      '',
      ' ##################',
      ' #.T..............#',
      ' #................#',
      ' #############....#',
      ' #.......ss.......#',
      ' #.......ss.......#',
      ' #....#############',
      ' #................#',
      ' #..............O.#',
      ' ##################',
    ],
  },
  {
    name: 'ISLAND',
    par: 4,
    rows: [
      '',
      ' ##################',
      ' #................#',
      ' #..wwwwwwwwwwww..#',
      ' #..ww........ww..#',
      ' #..ww......O.ww..#',
      ' #..ww........ww..#',
      ' #..wwwww..wwwww..#',
      ' #................#',
      ' #.T..............#',
      ' ##################',
    ],
  },
  {
    name: 'GRAND TOUR',
    par: 5,
    rows: [
      '',
      ' ##################',
      ' #.T....#.........#',
      ' #......#....O....#',
      ' #......#.........#',
      ' #......#ww.....ww#',
      ' #vvvvvv#...###...#',
      ' #......#...###...#',
      ' #......#.........#',
      ' #.ss...#^^^^^^^^^#',
      ' #.ss.............#',
      ' #................#',
      ' ##################',
    ],
  },
];

export interface Point {
  x: number;
  y: number;
}

/** A hole ready to play: the grid padded to full size, and the tee and cup as px centers on it. */
export interface Hole {
  name: string;
  par: number;
  grid: readonly string[];
  tee: Point;
  cup: Point;
  movers: readonly MoverDef[];
}

const TILES = new Set([' ', '#', '.', 's', 'T', 'O', 'w', '>', '<', '^', 'v']);

/** Boost pad directions as unit vectors. */
export const BOOST_DIRS: Readonly<Record<string, Point>> = {
  '>': { x: 1, y: 0 },
  '<': { x: -1, y: 0 },
  '^': { x: 0, y: -1 },
  v: { x: 0, y: 1 },
};

export function isSolidTile(ch: string): boolean {
  return ch === ' ' || ch === '#';
}

/** The center of a cell in px. */
export function cellCenter(col: number, row: number): Point {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

/** Everything wrong with a layout, as readable lines. An empty list means it is playable. */
export function holeProblems(def: HoleDef): string[] {
  const problems: string[] = [];
  if (def.rows.length > ROWS) problems.push(`${def.rows.length} rows, at most ${ROWS}`);
  if (!Number.isInteger(def.par) || def.par < 1) problems.push(`par ${def.par} is not a positive whole number`);
  const grid = padded(def.rows);
  const found: Record<string, Point[]> = { T: [], O: [] };
  def.rows.forEach((row, y) => {
    if (row.length > COLS) problems.push(`row ${y} is ${row.length} wide, at most ${COLS}`);
    [...row].forEach((ch, x) => {
      if (!TILES.has(ch)) problems.push(`row ${y} col ${x}: unknown tile '${ch}'`);
      if (ch === 'T' || ch === 'O') found[ch].push({ x, y });
      const dir = BOOST_DIRS[ch];
      if (dir && isSolidTile(tileOf(grid, x + dir.x, y + dir.y))) problems.push(`row ${y} col ${x}: boost pad points into a wall`);
    });
  });
  if (found.T.length !== 1) problems.push(`${found.T.length} tees, needs exactly one`);
  if (found.O.length !== 1) problems.push(`${found.O.length} cups, needs exactly one`);
  if (found.T.length === 1 && found.O.length === 1 && !connected(grid, found.T[0], found.O[0])) problems.push('the cup cannot be reached from the tee on dry ground');
  return problems;
}

/** Parses a layout, or throws with everything wrong with it. */
export function parseHole(def: HoleDef): Hole {
  const problems = holeProblems(def);
  if (problems.length) throw new Error(`hole ${def.name}: ${problems.join('; ')}`);
  const grid = padded(def.rows);
  const find = (ch: string): Point => {
    const y = grid.findIndex((row) => row.includes(ch));
    return cellCenter(grid[y].indexOf(ch), y);
  };
  return { name: def.name, par: def.par, grid, tee: find('T'), cup: find('O'), movers: def.movers ?? [] };
}

/** The tile at a cell; outside the grid is out of bounds. */
export function tileOf(grid: readonly string[], col: number, row: number): string {
  if (row < 0 || row >= grid.length || col < 0) return ' ';
  return grid[row][col] ?? ' ';
}

function padded(rows: readonly string[]): string[] {
  const out: string[] = [];
  for (let y = 0; y < ROWS; y++) out.push((rows[y] ?? '').padEnd(COLS, ' ').slice(0, COLS));
  return out;
}

/** True when a path of dry (non-water) floor joins two cells. */
function connected(grid: readonly string[], from: Point, to: Point): boolean {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length) {
    const { x, y } = queue.pop()!;
    if (x === to.x && y === to.y) return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const ch = tileOf(grid, nx, ny);
      const key = `${nx},${ny}`;
      if (isSolidTile(ch) || ch === 'w' || seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}
