import { describe, expect, it } from 'vitest';
import { cratesHome, isSolved, levelScore, liveCells, parseLevel, Puzzle, step, tryMove } from './rules';

/** A corridor: robot, crate, gap, target. */
const LINE = ['#######', '#@$ . #', '#######'];
const at = (x: number, y: number, width = 7) => y * width + x;

describe('parseLevel', () => {
  it('reads walls, floor, crates, targets and the robot', () => {
    const level = parseLevel(['#####', '#+*$#', '#. ##', '####']);
    expect(level.width).toBe(5);
    expect(level.height).toBe(4);
    expect(level.start.player).toBe(at(1, 1, 5));
    expect(level.start.crates).toEqual([at(2, 1, 5), at(3, 1, 5)]);
    expect(level.targets).toEqual([at(1, 1, 5), at(2, 1, 5), at(1, 2, 5)]);
    expect(level.walls[0]).toBe(true);
    expect(level.walls[at(2, 2, 5)]).toBe(false);
  });

  it('pads short rows, and only counts floor the robot can reach', () => {
    const level = parseLevel(['  ###', '###@#', '#  .#', '#$ ##', '####']);
    expect(level.width).toBe(5);
    expect(level.floor[0]).toBe(false);
    expect(level.floor[at(1, 2, 5)]).toBe(true);
  });

  it('accepts - as floor', () => {
    expect(parseLevel(['#####', '#@-$.#', '######']).walls[at(2, 1, 6)]).toBe(false);
  });

  it('rejects unknown characters and a missing or second robot', () => {
    expect(() => parseLevel(['#@x#'])).toThrow();
    expect(() => parseLevel(['# $.#'])).toThrow();
    expect(() => parseLevel(['#@@#'])).toThrow();
  });
});

describe('liveCells', () => {
  it('marks a non-target corner as dead, even on a row with a target', () => {
    const level = parseLevel(LINE);
    const live = liveCells(level);
    expect(live[at(5, 1)]).toBe(false);
    expect(live[at(3, 1)]).toBe(true);
  });

  it('keeps a corner target and its approach live', () => {
    const level = parseLevel(['#####', '#@$.#', '#####']);
    const live = liveCells(level);
    expect(live[level.targets[0]]).toBe(true);
    expect(live[level.start.crates[0]]).toBe(true);
  });
});

describe('step', () => {
  it('moves one cell and stops at the grid edge', () => {
    const size = { width: 3, height: 2 };
    expect(step(size, 0, 'right')).toBe(1);
    expect(step(size, 0, 'down')).toBe(3);
    expect(step(size, 0, 'left')).toBe(-1);
    expect(step(size, 2, 'right')).toBe(-1);
    expect(step(size, 4, 'down')).toBe(-1);
  });
});

describe('tryMove', () => {
  const level = parseLevel(LINE);

  it('walks onto empty floor', () => {
    const room = parseLevel(['#####', '#@ .#', '# $ #', '#####']);
    const r = tryMove(room, room.start, 'right');
    expect(r?.to).toBe(at(2, 1, 5));
    expect(r?.push).toBeUndefined();
  });

  it('pushes a crate with free floor beyond it', () => {
    const r = tryMove(level, level.start, 'right');
    expect(r).toMatchObject({ from: at(1, 1), to: at(2, 1), push: { from: at(2, 1), to: at(3, 1) } });
    expect(r?.state.crates).toEqual([at(3, 1)]);
  });

  it('is blocked by walls and leaves the state alone', () => {
    expect(tryMove(level, level.start, 'up')).toBeNull();
    expect(tryMove(level, level.start, 'left')).toBeNull();
    expect(level.start.crates).toEqual([at(2, 1)]);
  });

  it('cannot push a crate into a wall or into another crate', () => {
    const wall = parseLevel(['#####', '#@$##', '#  .#', '#####']);
    expect(tryMove(wall, wall.start, 'right')).toBeNull();
    const two = parseLevel(['#######', '#@$$..#', '#######']);
    expect(tryMove(two, two.start, 'right')).toBeNull();
  });

  it('never pulls: walking away leaves the crate', () => {
    const level2 = parseLevel(['#######', '# @$ .#', '#######']);
    const r = tryMove(level2, level2.start, 'left');
    expect(r?.state.crates).toEqual(level2.start.crates);
  });

  it('keeps crates sorted, so equal positions compare equal', () => {
    const level2 = parseLevel(['#######', '#.  $ #', '#. $@ #', '#######']);
    const r = tryMove(level2, level2.start, 'left');
    expect(r?.state.crates).toEqual([...r!.state.crates].sort((a, b) => a - b));
  });
});

describe('isSolved and cratesHome', () => {
  it('needs every crate on a target', () => {
    const level = parseLevel(['########', '#@ $*. #', '########']);
    expect(cratesHome(level, level.start)).toBe(1);
    expect(isSolved(level, level.start)).toBe(false);
    const next = tryMove(level, tryMove(level, level.start, 'right')!.state, 'right');
    expect(next).toBeNull();
  });

  it('is true once the last crate lands', () => {
    const level = parseLevel(LINE);
    const p = new Puzzle(level);
    p.move('right');
    expect(p.solved).toBe(false);
    p.move('right');
    expect(p.solved).toBe(true);
    expect(cratesHome(level, p.state)).toBe(1);
  });
});

describe('Puzzle', () => {
  it('counts moves and pushes, and ignores blocked moves', () => {
    const p = new Puzzle(parseLevel(LINE));
    expect(p.move('up')).toBeNull();
    p.move('right');
    expect(p.moves).toBe(1);
    expect(p.pushes).toBe(1);
    p.move('left');
    expect(p.moves).toBe(2);
    expect(p.pushes).toBe(1);
  });

  it('undoes several steps, counters included, back to the start', () => {
    const level = parseLevel(LINE);
    const p = new Puzzle(level);
    p.move('right');
    p.move('right');
    p.move('left');
    expect(p.undo()?.player).toBe(at(2, 1));
    expect(p.moves).toBe(2);
    expect(p.pushes).toBe(2);
    p.undo();
    expect(p.pushes).toBe(1);
    expect(p.state.crates).toEqual([at(3, 1)]);
    p.undo();
    expect(p.state).toEqual(level.start);
    expect(p.moves).toBe(0);
    expect(p.pushes).toBe(0);
    expect(p.canUndo).toBe(false);
    expect(p.undo()).toBeNull();
  });

  it('restarts from the start with an empty history', () => {
    const level = parseLevel(LINE);
    const p = new Puzzle(level);
    p.move('right');
    p.move('right');
    p.restart();
    expect(p.state).toEqual(level.start);
    expect(p.moves).toBe(0);
    expect(p.pushes).toBe(0);
    expect(p.canUndo).toBe(false);
  });
});

describe('levelScore', () => {
  it('gives 1000 at or under par, less for longer solutions, at least 100', () => {
    expect(levelScore(10, 10)).toBe(1000);
    expect(levelScore(8, 10)).toBe(1000);
    expect(levelScore(20, 10)).toBe(500);
    expect(levelScore(1000, 10)).toBe(100);
  });

  it('gives nothing for an unsolved level', () => {
    expect(levelScore(undefined, 10)).toBe(0);
    expect(levelScore(0, 10)).toBe(0);
  });
});
