import { BONUS_BASE_POINTS, COLS, FOOD_POINTS, MIN_STEP_MS, ROWS, STEP_SPEEDUP_MS, TURN_BUFFER } from './config';

/**
 * Pure Neon Snake rules: the turn buffer, one step of movement with every collision resolved
 * together, growth, scoring and the speed-up. No Phaser here, so the rules can be tested; the scene
 * owns input, timing, drawing and sound.
 */

export interface Cell {
  x: number;
  y: number;
}

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;
export type DirName = keyof typeof DIRS;

export const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
export const key = (c: Cell): string => `${c.x},${c.y}`;

/**
 * Buffers a turn so quick key presses between steps are not lost. `current` is the direction the
 * snake is moving. Repeats, 180-degree reversals into the snake's own neck and presses beyond the
 * buffer are ignored. Returns true if the turn was queued (the queue is changed in place).
 */
export function queueTurn(queue: Cell[], current: Cell, dir: Cell): boolean {
  const last = queue.at(-1) ?? current;
  const reversal = dir.x === -last.x && dir.y === -last.y;
  if (same(dir, last) || reversal || queue.length >= TURN_BUFFER) return false;
  queue.push(dir);
  return true;
}

/** A snake as the step rules see it: head first, moving in `dir`. */
export interface StepSnake {
  segments: Cell[];
  dir: Cell;
}

export interface Move {
  /** Where the head goes this step. */
  head: Cell;
  /** True if that cell holds the food. */
  grows: boolean;
  /** True if the snake hits a wall, a body or another head. */
  crashed: boolean;
}

/**
 * Works out one step for every living snake at once, so the result does not depend on player
 * order. A snake crashes if its new head leaves the field, lands on a cell that is still occupied
 * after the step (tails move away unless that snake is growing), meets another head in the same
 * cell, or swaps places with another head.
 */
export function resolveStep(snakes: readonly StepSnake[], food: Cell): Move[] {
  const moves = snakes.map((s) => {
    const head = { x: s.segments[0].x + s.dir.x, y: s.segments[0].y + s.dir.y };
    return { snake: s, head, grows: same(head, food), crashed: false };
  });

  const occupied = new Set<string>();
  for (const m of moves) (m.grows ? m.snake.segments : m.snake.segments.slice(0, -1)).forEach((c) => occupied.add(key(c)));

  for (const m of moves) {
    const { head } = m;
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS || occupied.has(key(head))) m.crashed = true;
    for (const o of moves) {
      if (o === m) continue;
      const headOn = same(head, o.head);
      const swapped = same(head, o.snake.segments[0]) && same(o.head, m.snake.segments[0]);
      if (headOn || swapped) m.crashed = true;
    }
  }
  return moves.map(({ head, grows, crashed }) => ({ head, grows, crashed }));
}

/** The body after a step: the new head in front, and the tail dropped unless the snake grew. */
export function advance(segments: readonly Cell[], head: Cell, grows: boolean): Cell[] {
  return grows ? [head, ...segments] : [head, ...segments.slice(0, -1)];
}

/** Points for a piece of food; `eaten` counts it. Every ten pieces raise the value. */
export function foodPoints(eaten: number): number {
  return FOOD_POINTS * (1 + Math.floor(eaten / 10));
}

/** Points for a bonus star, worth more the sooner it is caught. */
export function bonusPoints(msLeft: number): number {
  return BONUS_BASE_POINTS + Math.max(0, Math.ceil(msLeft / 1000)) * 10;
}

/** The step interval after eating: a little faster each time, down to a floor. */
export function nextStepMs(stepMs: number): number {
  return Math.max(MIN_STEP_MS, stepMs - STEP_SPEEDUP_MS);
}

/** Every cell of the field that is not in `taken`, for placing food. */
export function freeCells(taken: readonly Cell[]): Cell[] {
  const used = new Set(taken.map(key));
  const free: Cell[] = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!used.has(`${x},${y}`)) free.push({ x, y });
  return free;
}
