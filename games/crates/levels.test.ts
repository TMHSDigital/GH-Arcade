import { describe, expect, it } from 'vitest';
import { BOARD } from './config';
import { LEVELS } from './levels';
import { parseLevel, Puzzle } from './rules';
import { liveCells, solve } from './solver';
import { TROPHIES } from './trophies';

describe('levels', () => {
  it('there are about fifteen, with unique names', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(LEVELS.length);
  });

  it('the last trophy asks for every level', () => {
    const all = TROPHIES.find((t) => t.id === 'crates.all');
    expect(all?.threshold).toBe(LEVELS.length);
    expect(all?.description).toBe(`Solve all ${LEVELS.length} levels`);
  });

  describe.each(LEVELS.map((def, i) => [i + 1, def.name, def] as const))('%i %s', (_n, _name, def) => {
    const level = parseLevel(def.map);

    it('parses with one robot and as many crates as targets', () => {
      expect(def.map.join('').split('').filter((c) => c === '@' || c === '+')).toHaveLength(1);
      expect(level.start.crates.length).toBeGreaterThan(0);
      expect(level.start.crates.length).toBe(level.targets.length);
    });

    it('is closed in by walls, with every crate and target inside', () => {
      for (let i = 0; i < level.walls.length; i++) {
        if (!level.floor[i]) continue;
        const x = i % level.width;
        const y = Math.floor(i / level.width);
        expect(x > 0 && y > 0 && x < level.width - 1 && y < level.height - 1, `open edge at ${x},${y}`).toBe(true);
      }
      for (const c of [...level.start.crates, ...level.targets]) expect(level.floor[c]).toBe(true);
    });

    it('starts with every crate somewhere it can still reach a target', () => {
      const live = liveCells(level);
      for (const c of level.start.crates) expect(live[c]).toBe(true);
    });

    it('fits the board at a readable size', () => {
      expect(Math.min(BOARD.width / level.width, BOARD.height / level.height)).toBeGreaterThanOrEqual(36);
    });

    it('can be solved, its par is the fewest moves, and the solution plays back', () => {
      const solution = solve(level);
      expect(solution).not.toBeNull();
      expect(solution!.moves).toBe(def.par);
      const puzzle = new Puzzle(level);
      for (const dir of solution!.path) expect(puzzle.move(dir)).not.toBeNull();
      expect(puzzle.solved).toBe(true);
      expect(puzzle.moves).toBe(def.par);
      expect(puzzle.pushes).toBe(solution!.pushes);
    });

    it('is not already solved', () => {
      expect(new Puzzle(level).solved).toBe(false);
    });
  });

  it('are ordered by par, easiest first', () => {
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].par).toBeGreaterThanOrEqual(LEVELS[i - 1].par);
  });
});

describe('solver', () => {
  it('reports a level with a crate stuck in a corner as unsolvable', () => {
    expect(solve(parseLevel(['#####', '#$ @#', '#  .#', '#####']))).toBeNull();
  });

  it('finds the shortest route, walking included', () => {
    const s = solve(parseLevel(['######', '#@   #', '#  $.#', '######']));
    expect(s).toMatchObject({ moves: 3, pushes: 1 });
  });
});
