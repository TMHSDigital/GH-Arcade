/**
 * Pure Neon Crates rules: level parsing, moving and pushing, undo history and the win check. No
 * Phaser here, so the rules can be tested; the scene owns input, tweens, drawing and sound.
 *
 * Levels are text grids, one string per row:
 *
 *   #  wall          .  target
 *   $  crate         *  crate on a target
 *   @  robot         +  robot on a target
 *   space or -  floor
 *
 * Cells are numbered row by row (index = y * width + x).
 */

import { type Dir, DIRS } from '../../shared/hold-repeat';

// The four directions are shared by every grid game.
export { type Dir, DIRS };

export const VEC: Record<Dir, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

export interface Level {
  width: number;
  height: number;
  /** One flag per cell. */
  walls: boolean[];
  /** Target cells, in reading order. */
  targets: number[];
  /** Floor the robot can ever stand on (reachable from its start), for drawing the room. */
  floor: boolean[];
  /** Starting state. */
  start: State;
}

export interface State {
  player: number;
  /** Crate cells, kept sorted so equal states compare equal. */
  crates: number[];
}

const KNOWN = new Set(['#', '.', '$', '*', '@', '+', ' ', '-']);

/** Parses a level grid. Throws on unknown characters or a missing or doubled robot. */
export function parseLevel(rows: readonly string[]): Level {
  const height = rows.length;
  const width = Math.max(0, ...rows.map((r) => r.length));
  const walls: boolean[] = [];
  const targets: number[] = [];
  const crates: number[] = [];
  let player = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x] ?? ' ';
      if (!KNOWN.has(ch)) throw new Error(`Unknown level character "${ch}" at ${x},${y}`);
      const i = y * width + x;
      walls.push(ch === '#');
      if (ch === '.' || ch === '*' || ch === '+') targets.push(i);
      if (ch === '$' || ch === '*') crates.push(i);
      if (ch === '@' || ch === '+') {
        if (player !== -1) throw new Error('A level has exactly one robot');
        player = i;
      }
    }
  }
  if (player === -1) throw new Error('A level has exactly one robot');
  const level: Level = { width, height, walls, targets, floor: [], start: { player, crates: crates.sort((a, b) => a - b) } };
  level.floor = reachableFloor(level, player);
  return level;
}

/** Every non-wall cell connected to `from`, ignoring crates. */
function reachableFloor(level: Level, from: number): boolean[] {
  const seen = level.walls.map(() => false);
  seen[from] = true;
  const queue = [from];
  while (queue.length) {
    const cell = queue.pop()!;
    for (const d of DIRS) {
      const next = step(level, cell, d);
      if (next !== -1 && !level.walls[next] && !seen[next]) {
        seen[next] = true;
        queue.push(next);
      }
    }
  }
  return seen;
}

/** The cell one step from `cell` in `dir`, or -1 off the edge of the grid. */
export function step(level: Pick<Level, 'width' | 'height'>, cell: number, dir: Dir): number {
  const x = (cell % level.width) + VEC[dir].x;
  const y = Math.floor(cell / level.width) + VEC[dir].y;
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return -1;
  return y * level.width + x;
}

export interface MoveResult {
  state: State;
  /** Where the robot went from and to. */
  from: number;
  to: number;
  /** Set when a crate was pushed. */
  push?: { from: number; to: number };
}

/** Tries a step: walks, pushes one crate, or returns null when blocked. Never changes `state`. */
export function tryMove(level: Level, state: State, dir: Dir): MoveResult | null {
  const to = step(level, state.player, dir);
  if (to === -1 || level.walls[to]) return null;
  const crateAt = state.crates.indexOf(to);
  if (crateAt === -1) return { state: { player: to, crates: state.crates }, from: state.player, to };
  const beyond = step(level, to, dir);
  if (beyond === -1 || level.walls[beyond] || state.crates.includes(beyond)) return null;
  const crates = state.crates.slice();
  crates[crateAt] = beyond;
  crates.sort((a, b) => a - b);
  return { state: { player: to, crates }, from: state.player, to, push: { from: to, to: beyond } };
}

/** True when every crate sits on a target. */
export function isSolved(level: Level, state: State): boolean {
  return state.crates.every((c) => level.targets.includes(c));
}

/** How many crates sit on targets. */
export function cratesHome(level: Level, state: State): number {
  return state.crates.filter((c) => level.targets.includes(c)).length;
}

/**
 * Cells a crate may stand on: the targets and every cell a crate can be pushed to a target from.
 * A crate anywhere else (a corner, or along a wall with no target) can never be solved, so the game
 * warns when one is pushed there and the solver never pushes one there.
 */
export function liveCells(level: Level): boolean[] {
  const open = (c: number) => c !== -1 && !level.walls[c] && level.floor[c];
  const live = level.walls.map(() => false);
  const queue = [...level.targets];
  for (const t of queue) live[t] = true;
  while (queue.length) {
    const c = queue.pop()!;
    // Pull the crate from c one step in d: it lands on c + d and the robot stands one further on.
    for (const d of DIRS) {
      const to = step(level, c, d);
      const robot = to === -1 ? -1 : step(level, to, d);
      if (open(to) && open(robot) && !live[to]) {
        live[to] = true;
        queue.push(to);
      }
    }
  }
  return live;
}

/**
 * One level in play: the current state, the move and push counters and the undo history. Undo
 * steps back one move at a time and takes the counters back with it.
 */
export class Puzzle {
  state: State;
  private readonly history: { state: State; pushed: boolean }[] = [];
  private pushCount = 0;

  constructor(readonly level: Level) {
    this.state = level.start;
  }

  get moves(): number {
    return this.history.length;
  }

  get pushes(): number {
    return this.pushCount;
  }

  get solved(): boolean {
    return isSolved(this.level, this.state);
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /** Moves the robot; returns what happened, or null when the way is blocked. */
  move(dir: Dir): MoveResult | null {
    const result = tryMove(this.level, this.state, dir);
    if (!result) return null;
    this.history.push({ state: this.state, pushed: !!result.push });
    if (result.push) this.pushCount++;
    this.state = result.state;
    return result;
  }

  /** Takes back the last move. Returns the state that was left, or null with nothing to undo. */
  undo(): State | null {
    const last = this.history.pop();
    if (!last) return null;
    const left = this.state;
    this.state = last.state;
    if (last.pushed) this.pushCount--;
    return left;
  }

  /** Back to the start; the history is cleared. */
  restart(): void {
    this.history.length = 0;
    this.pushCount = 0;
    this.state = this.level.start;
  }
}

/** Points for a solved level: 1000 at par, fewer for longer solutions, never under 100. 0 unsolved. */
export function levelScore(bestMoves: number | undefined, par: number): number {
  if (!bestMoves || bestMoves <= 0) return 0;
  return Math.max(100, Math.round((1000 * Math.min(par, bestMoves)) / bestMoves));
}
