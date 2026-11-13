import { describe, expect, it } from 'vitest';
import { BONUS_BASE_POINTS, COLS, FOOD_POINTS, MIN_STEP_MS, ROWS, START_STEP_MS, STEP_SPEEDUP_MS, TURN_BUFFER } from './config';
import { advance, bonusPoints, type Cell, DIRS, foodPoints, freeCells, nextStepMs, queueTurn, resolveStep, type StepSnake } from './logic';

const FAR: Cell = { x: 30, y: 20 };
/** A straight snake with its head at (x, y), body trailing opposite to `dir`. */
function snake(x: number, y: number, dir: Cell, length = 4): StepSnake {
  return { dir, segments: Array.from({ length }, (_, i) => ({ x: x - dir.x * i, y: y - dir.y * i })) };
}

describe('queueTurn', () => {
  it('queues a turn to the side', () => {
    const queue: Cell[] = [];
    expect(queueTurn(queue, DIRS.right, DIRS.up)).toBe(true);
    expect(queue).toEqual([DIRS.up]);
  });

  it('ignores a repeat of the current direction', () => {
    const queue: Cell[] = [];
    expect(queueTurn(queue, DIRS.right, DIRS.right)).toBe(false);
    expect(queue).toEqual([]);
  });

  it('ignores a reversal into the neck', () => {
    const queue: Cell[] = [];
    expect(queueTurn(queue, DIRS.right, DIRS.left)).toBe(false);
  });

  it('judges repeats and reversals against the last queued turn, not the current heading', () => {
    const queue: Cell[] = [DIRS.up];
    expect(queueTurn(queue, DIRS.right, DIRS.down)).toBe(false);
    expect(queueTurn(queue, DIRS.right, DIRS.up)).toBe(false);
    // Up then left is a legal U-turn over two steps.
    expect(queueTurn(queue, DIRS.right, DIRS.left)).toBe(true);
    expect(queue).toEqual([DIRS.up, DIRS.left]);
  });

  it('holds at most TURN_BUFFER turns', () => {
    const queue: Cell[] = [];
    const turns = [DIRS.up, DIRS.left, DIRS.down, DIRS.right, DIRS.up];
    const accepted = turns.map((d) => queueTurn(queue, DIRS.right, d));
    expect(queue).toHaveLength(TURN_BUFFER);
    expect(accepted.filter(Boolean)).toHaveLength(TURN_BUFFER);
  });
});

describe('resolveStep', () => {
  it('moves the head one cell in its direction', () => {
    const [move] = resolveStep([snake(5, 5, DIRS.right)], FAR);
    expect(move).toEqual({ head: { x: 6, y: 5 }, grows: false, crashed: false });
  });

  it('grows when the head reaches the food', () => {
    const [move] = resolveStep([snake(5, 5, DIRS.right)], { x: 6, y: 5 });
    expect(move.grows).toBe(true);
    expect(move.crashed).toBe(false);
  });

  it('crashes into each wall', () => {
    expect(resolveStep([snake(0, 5, DIRS.left)], FAR)[0].crashed).toBe(true);
    expect(resolveStep([snake(COLS - 1, 5, DIRS.right)], FAR)[0].crashed).toBe(true);
    expect(resolveStep([snake(5, 0, DIRS.up)], FAR)[0].crashed).toBe(true);
    expect(resolveStep([snake(5, ROWS - 1, DIRS.down)], FAR)[0].crashed).toBe(true);
  });

  it('crashes into its own body', () => {
    // A hook shape: the head turns back into the third segment.
    const self: StepSnake = {
      dir: DIRS.left,
      segments: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
        { x: 4, y: 4 },
      ],
    };
    expect(resolveStep([self], FAR)[0].crashed).toBe(true);
  });

  it('may follow its own tail, because the tail moves away', () => {
    // A 2x2 loop: the head steps into the cell the tail is leaving.
    const loop: StepSnake = {
      dir: DIRS.left,
      segments: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
      ],
    };
    expect(resolveStep([loop], FAR)[0].crashed).toBe(false);
  });

  it('does crash into its tail when it is growing, because the tail stays', () => {
    const loop: StepSnake = {
      dir: DIRS.left,
      segments: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 4, y: 5 },
      ],
    };
    // Food on the tail cell is contrived, but it pins the rule: a growing snake keeps its tail.
    expect(resolveStep([loop], { x: 4, y: 5 })[0].crashed).toBe(true);
  });

  it('crashes a snake that runs into the other one, and only that snake', () => {
    const a = snake(5, 5, DIRS.right);
    const b = snake(6, 8, DIRS.up, 6); // body runs from (6,8) down to (6,13)
    const victim = snake(5, 10, DIRS.right);
    const moves = resolveStep([victim, b], FAR);
    expect(moves[0].crashed).toBe(true);
    expect(moves[1].crashed).toBe(false);
    expect(resolveStep([a, b], FAR).map((m) => m.crashed)).toEqual([false, false]);
  });

  it('crashes both snakes in a head-on meeting in the same cell', () => {
    const moves = resolveStep([snake(5, 5, DIRS.right), snake(7, 5, DIRS.left)], FAR);
    expect(moves.map((m) => m.crashed)).toEqual([true, true]);
  });

  it('crashes both snakes when their heads swap places', () => {
    const moves = resolveStep([snake(5, 5, DIRS.right), snake(6, 5, DIRS.left)], FAR);
    expect(moves.map((m) => m.crashed)).toEqual([true, true]);
  });

  it('gives the same result whichever player is listed first', () => {
    const a = snake(5, 5, DIRS.right);
    const b = snake(7, 5, DIRS.left);
    const ab = resolveStep([a, b], FAR);
    const ba = resolveStep([b, a], FAR);
    expect(ab[0]).toEqual(ba[1]);
    expect(ab[1]).toEqual(ba[0]);
  });
});

describe('advance', () => {
  const body = snake(5, 5, DIRS.right).segments;

  it('keeps the length when not growing', () => {
    const next = advance(body, { x: 6, y: 5 }, false);
    expect(next).toHaveLength(body.length);
    expect(next[0]).toEqual({ x: 6, y: 5 });
    expect(next.at(-1)).toEqual(body.at(-2));
  });

  it('adds a segment when growing', () => {
    const next = advance(body, { x: 6, y: 5 }, true);
    expect(next).toHaveLength(body.length + 1);
    expect(next.at(-1)).toEqual(body.at(-1));
  });

  it('does not change the input', () => {
    const copy = body.map((c) => ({ ...c }));
    advance(body, { x: 6, y: 5 }, false);
    expect(body).toEqual(copy);
  });
});

describe('scoring and speed', () => {
  it('food is worth more every ten pieces', () => {
    expect(foodPoints(1)).toBe(FOOD_POINTS);
    expect(foodPoints(9)).toBe(FOOD_POINTS);
    expect(foodPoints(10)).toBe(FOOD_POINTS * 2);
    expect(foodPoints(25)).toBe(FOOD_POINTS * 3);
  });

  it('a bonus star is worth more the sooner it is caught', () => {
    expect(bonusPoints(0)).toBe(BONUS_BASE_POINTS);
    expect(bonusPoints(-500)).toBe(BONUS_BASE_POINTS);
    expect(bonusPoints(4200)).toBe(BONUS_BASE_POINTS + 50);
    expect(bonusPoints(6000)).toBeGreaterThan(bonusPoints(1000));
  });

  it('the snake speeds up with each piece, down to a floor', () => {
    expect(nextStepMs(START_STEP_MS)).toBe(START_STEP_MS - STEP_SPEEDUP_MS);
    let step = START_STEP_MS;
    for (let i = 0; i < 200; i++) step = nextStepMs(step);
    expect(step).toBe(MIN_STEP_MS);
  });
});

describe('freeCells', () => {
  it('is the whole field when nothing is taken', () => {
    expect(freeCells([])).toHaveLength(COLS * ROWS);
  });

  it('leaves out taken cells', () => {
    const taken = snake(5, 5, DIRS.right).segments;
    const free = freeCells(taken);
    expect(free).toHaveLength(COLS * ROWS - taken.length);
    for (const c of taken) expect(free).not.toContainEqual(c);
  });
});
