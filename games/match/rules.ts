/**
 * Neon Match board rules: filling, swapping, matching (special shapes included), clearing with
 * special gem blasts, gravity, cascade scoring, move finding and reshuffling. No Phaser here, so it
 * is all covered by rules.test.ts. Rows count down from the top: row 0 is the top of the board.
 */

/** What a gem does when it is cleared: nothing, clear its row, clear its column, or blast around it. */
export type Special = 'none' | 'lineH' | 'lineV' | 'bomb';

export interface Gem {
  /** Stable for the gem's life on the board, so the scene can follow it as it falls or shuffles. */
  id: number;
  /** 0 to colors - 1. */
  color: number;
  special: Special;
}

export interface Pos {
  r: number;
  c: number;
}

export interface Board {
  size: number;
  colors: number;
  grid: (Gem | null)[][];
  nextId: number;
}

/** Anything that returns a float in [0, 1), like Math.random or a seeded `rng.next`. */
export type Random = () => number;

export const BOARD_SIZE = 8;
export const GEM_COLORS = 6;
/** Base points for every gem cleared, multiplied by the cascade chain. */
export const GEM_POINTS = 10;
/** Bonus for making a line gem or a bomb gem, multiplied by the chain too. */
export const SPECIAL_POINTS: Record<Exclude<Special, 'none'>, number> = { lineH: 60, lineV: 60, bomb: 150 };
/** A bomb clears every gem within this many cells of it (a 3x3 square). */
export const BOMB_RADIUS = 1;

function randomColor(board: Board, random: Random): number {
  return Math.floor(random() * board.colors) % board.colors;
}

function newGem(board: Board, color: number, special: Special = 'none'): Gem {
  return { id: board.nextId++, color, special };
}

export function inBounds(board: Board, p: Pos): boolean {
  return p.r >= 0 && p.c >= 0 && p.r < board.size && p.c < board.size;
}

export function gemAt(board: Board, p: Pos): Gem | null {
  return inBounds(board, p) ? board.grid[p.r][p.c] : null;
}

export function areAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

const key = (p: Pos) => p.r * 100 + p.c;

/** An empty board, for tests and for building one up cell by cell. */
export function emptyBoard(size = BOARD_SIZE, colors = GEM_COLORS): Board {
  return { size, colors, grid: Array.from({ length: size }, () => Array<Gem | null>(size).fill(null)), nextId: 1 };
}

/**
 * Builds a board from rows of digits (the gem colors), for tests. Letters add specials: `h` and `v`
 * after a digit make it a line gem, `b` a bomb, and `.` is an empty cell.
 */
export function boardFrom(rows: string[], colors = GEM_COLORS): Board {
  const board = emptyBoard(rows.length, colors);
  rows.forEach((row, r) => {
    const tokens = row.match(/\.|\d[hvb]?/g) ?? [];
    tokens.forEach((t, c) => {
      if (t === '.') return;
      const special: Special = t[1] === 'h' ? 'lineH' : t[1] === 'v' ? 'lineV' : t[1] === 'b' ? 'bomb' : 'none';
      board.grid[r][c] = newGem(board, Number(t[0]), special);
    });
  });
  return board;
}

/** The colors as rows of digits, the inverse of boardFrom for plain gems. Handy in test failures. */
export function colorRows(board: Board): string[] {
  return board.grid.map((row) => row.map((g) => (g ? String(g.color) : '.')).join(''));
}

/** A copy that can be changed without touching the original. Gems are copied too. */
export function cloneBoard(board: Board): Board {
  return { ...board, grid: board.grid.map((row) => row.map((g) => (g ? { ...g } : null))) };
}

/**
 * A new full board with no line of three anywhere and at least one move to make. Each gem avoids
 * the color that would finish a line with the two before it, across or down.
 */
export function fillBoard(random: Random, size = BOARD_SIZE, colors = GEM_COLORS): Board {
  for (;;) {
    const board = emptyBoard(size, colors);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const banned = new Set<number>();
        const left = board.grid[r][c - 1];
        if (c >= 2 && left && left.color === board.grid[r][c - 2]?.color) banned.add(left.color);
        const up = board.grid[r - 1]?.[c];
        if (r >= 2 && up && up.color === board.grid[r - 2][c]?.color) banned.add(up.color);
        const allowed = Array.from({ length: colors }, (_, i) => i).filter((i) => !banned.has(i));
        board.grid[r][c] = newGem(board, allowed[Math.floor(random() * allowed.length) % allowed.length]);
      }
    }
    if (findMove(board)) return board;
  }
}

// ---------------------------------------------------------------- matching

export interface Run {
  cells: Pos[];
  dir: 'h' | 'v';
}

/** One connected match: its runs (an L or T has one each way) and every cell in it. */
export interface MatchGroup {
  color: number;
  runs: Run[];
  cells: Pos[];
  /** The special gem this match makes, if any. */
  makes: Special;
}

/** Every straight line of three or more same-colored gems, across then down. */
export function findRuns(board: Board): Run[] {
  const runs: Run[] = [];
  const scan = (dir: 'h' | 'v') => {
    for (let a = 0; a < board.size; a++) {
      let start = 0;
      for (let b = 1; b <= board.size; b++) {
        const at = (i: number) => (dir === 'h' ? board.grid[a][i] : board.grid[i]?.[a]);
        const first = at(start);
        const cur = b < board.size ? at(b) : null;
        if (cur && first && cur.color === first.color) continue;
        if (first && b - start >= 3) {
          const cells: Pos[] = [];
          for (let i = start; i < b; i++) cells.push(dir === 'h' ? { r: a, c: i } : { r: i, c: a });
          runs.push({ cells, dir });
        }
        start = b;
      }
    }
  };
  scan('h');
  scan('v');
  return runs;
}

/** What a match of these runs makes: five in a line or an L/T makes a bomb, four makes a line gem. */
export function specialFor(runs: Run[]): Special {
  const longest = runs.reduce((best, run) => (run.cells.length > best.cells.length ? run : best), runs[0]);
  const crossed = runs.some((r) => r.dir === 'h') && runs.some((r) => r.dir === 'v');
  if (crossed || longest.cells.length >= 5) return 'bomb';
  if (longest.cells.length === 4) return longest.dir === 'h' ? 'lineH' : 'lineV';
  return 'none';
}

/** The matches on the board, with runs that share a gem joined into one group (an L, T or plus). */
export function findMatches(board: Board): MatchGroup[] {
  const runs = findRuns(board);
  const parent = runs.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const owner = new Map<number, number>();
  runs.forEach((run, i) => {
    for (const p of run.cells) {
      const k = key(p);
      const other = owner.get(k);
      if (other === undefined) owner.set(k, i);
      else parent[root(i)] = root(other);
    }
  });
  const byRoot = new Map<number, Run[]>();
  runs.forEach((run, i) => {
    const list = byRoot.get(root(i)) ?? [];
    list.push(run);
    byRoot.set(root(i), list);
  });
  return [...byRoot.values()].map((group) => {
    const seen = new Set<number>();
    const cells: Pos[] = [];
    for (const run of group) for (const p of run.cells) if (!seen.has(key(p)) && seen.add(key(p))) cells.push(p);
    return { color: board.grid[cells[0].r][cells[0].c]!.color, runs: group, cells, makes: specialFor(group) };
  });
}

/**
 * Where a match leaves its special gem: on the gem the player moved, if it is part of the match;
 * otherwise where the runs cross, or the middle of the longest run.
 */
export function specialSpot(group: MatchGroup, moved: Pos[] = []): Pos {
  const inGroup = moved.find((m) => group.cells.some((p) => p.r === m.r && p.c === m.c));
  if (inGroup) return inGroup;
  if (group.runs.length > 1) {
    const counts = new Map<number, number>();
    for (const run of group.runs) for (const p of run.cells) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
    const cross = group.cells.find((p) => (counts.get(key(p)) ?? 0) > 1);
    if (cross) return cross;
  }
  const longest = group.runs.reduce((best, run) => (run.cells.length > best.cells.length ? run : best), group.runs[0]);
  return longest.cells[Math.floor((longest.cells.length - 1) / 2)];
}

/** The cells a special gem clears when it goes off at `p`. */
export function blastArea(board: Board, p: Pos, special: Special): Pos[] {
  const out: Pos[] = [];
  if (special === 'lineH') for (let c = 0; c < board.size; c++) out.push({ r: p.r, c });
  if (special === 'lineV') for (let r = 0; r < board.size; r++) out.push({ r, c: p.c });
  if (special === 'bomb') {
    for (let r = p.r - BOMB_RADIUS; r <= p.r + BOMB_RADIUS; r++) {
      for (let c = p.c - BOMB_RADIUS; c <= p.c + BOMB_RADIUS; c++) if (inBounds(board, { r, c })) out.push({ r, c });
    }
  }
  return out;
}

// ---------------------------------------------------------------- swaps and moves

export function swapGems(board: Board, a: Pos, b: Pos): void {
  const tmp = board.grid[a.r][a.c];
  board.grid[a.r][a.c] = board.grid[b.r][b.c];
  board.grid[b.r][b.c] = tmp;
}

/** True if swapping these two neighbours makes a match. The board is left as it was. */
export function isValidSwap(board: Board, a: Pos, b: Pos): boolean {
  if (!inBounds(board, a) || !inBounds(board, b) || !areAdjacent(a, b)) return false;
  if (!gemAt(board, a) || !gemAt(board, b)) return false;
  swapGems(board, a, b);
  const ok = makesLineAt(board, a) || makesLineAt(board, b);
  swapGems(board, a, b);
  return ok;
}

/** True if the gem at p is part of a line of three or more. */
function makesLineAt(board: Board, p: Pos): boolean {
  const gem = gemAt(board, p);
  if (!gem) return false;
  const same = (r: number, c: number) => gemAt(board, { r, c })?.color === gem.color;
  const count = (dr: number, dc: number) => {
    let n = 0;
    while (same(p.r + dr * (n + 1), p.c + dc * (n + 1))) n++;
    return n;
  };
  return count(0, -1) + count(0, 1) >= 2 || count(-1, 0) + count(1, 0) >= 2;
}

/** A swap that makes a match, or null when the board has none (time to reshuffle). */
export function findMove(board: Board): [Pos, Pos] | null {
  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      const a = { r, c };
      for (const b of [{ r, c: c + 1 }, { r: r + 1, c }]) if (isValidSwap(board, a, b)) return [a, b];
    }
  }
  return null;
}

/** Every swap that makes a match. */
export function allMoves(board: Board): [Pos, Pos][] {
  const out: [Pos, Pos][] = [];
  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      const a = { r, c };
      for (const b of [{ r, c: c + 1 }, { r: r + 1, c }]) if (isValidSwap(board, a, b)) out.push([a, b]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- resolving

export interface ClearedGem {
  pos: Pos;
  gem: Gem;
}

export interface Fall {
  gem: Gem;
  col: number;
  /** Negative for a new gem dropping in from above the board. */
  fromRow: number;
  toRow: number;
}

export interface StepResult {
  groups: MatchGroup[];
  /** Every gem removed, by matches and by blasts. */
  cleared: ClearedGem[];
  /** Special gems that went off, in the order they did. */
  blasts: ClearedGem[];
  /** Special gems the matches made, already on the board. */
  created: ClearedGem[];
  falls: Fall[];
  chain: number;
  points: number;
}

/** Points for one step of a cascade: every gem cleared plus any specials made, times the chain. */
export function stepPoints(clearedCount: number, created: Special[], chain: number): number {
  const bonus = created.reduce((sum, s) => sum + (s === 'none' ? 0 : SPECIAL_POINTS[s]), 0);
  return (clearedCount * GEM_POINTS + bonus) * Math.max(1, chain);
}

/**
 * Removes the matched gems and anything their specials blast (a blast can set off more specials),
 * then puts the new special gems in place. Returns null when there is nothing to match. Gravity is
 * not applied: see `collapse`.
 */
export function clearMatches(board: Board, chain: number, moved: Pos[] = []): Omit<StepResult, 'falls'> | null {
  const groups = findMatches(board);
  if (groups.length === 0) return null;

  const spawns: { pos: Pos; color: number; special: Special }[] = [];
  for (const g of groups) if (g.makes !== 'none') spawns.push({ pos: specialSpot(g, moved), color: g.color, special: g.makes });

  const cleared: ClearedGem[] = [];
  const blasts: ClearedGem[] = [];
  const done = new Set<number>();
  const queue: Pos[] = groups.flatMap((g) => g.cells);
  while (queue.length) {
    const p = queue.shift()!;
    if (done.has(key(p))) continue;
    const gem = gemAt(board, p);
    if (!gem) continue;
    done.add(key(p));
    cleared.push({ pos: p, gem });
    board.grid[p.r][p.c] = null;
    if (gem.special !== 'none') {
      blasts.push({ pos: p, gem });
      queue.push(...blastArea(board, p, gem.special));
    }
  }

  const created: ClearedGem[] = [];
  for (const s of spawns) {
    if (board.grid[s.pos.r][s.pos.c]) continue;
    const gem = newGem(board, s.color, s.special);
    board.grid[s.pos.r][s.pos.c] = gem;
    created.push({ pos: s.pos, gem });
  }
  const points = stepPoints(
    cleared.length,
    created.map((c) => c.gem.special),
    chain,
  );
  return { groups, cleared, blasts, created, chain, points };
}

/** Drops every gem as far as it goes and fills the gaps at the top with new gems. */
export function collapse(board: Board, random: Random): Fall[] {
  const falls: Fall[] = [];
  for (let c = 0; c < board.size; c++) {
    let write = board.size - 1;
    for (let r = board.size - 1; r >= 0; r--) {
      const gem = board.grid[r][c];
      if (!gem) continue;
      if (write !== r) {
        board.grid[write][c] = gem;
        board.grid[r][c] = null;
        falls.push({ gem, col: c, fromRow: r, toRow: write });
      }
      write--;
    }
    // New gems stack up above the board in the order they land, so they fall in together.
    const empty = write + 1;
    for (let r = write; r >= 0; r--) {
      const gem = newGem(board, randomColor(board, random));
      board.grid[r][c] = gem;
      falls.push({ gem, col: c, fromRow: r - empty, toRow: r });
    }
  }
  return falls;
}

/**
 * One step of a cascade: clear the matches, then let the board fall and refill. `chain` is 1 for the
 * player's own move and one more for each cascade after it. Returns null when nothing matches.
 */
export function step(board: Board, random: Random, chain: number, moved: Pos[] = []): StepResult | null {
  const result = clearMatches(board, chain, moved);
  if (!result) return null;
  return { ...result, falls: collapse(board, random) };
}

/** Plays a whole cascade to the end, for tests and simulations. Returns every step. */
export function resolveAll(board: Board, random: Random, moved: Pos[] = []): StepResult[] {
  const steps: StepResult[] = [];
  for (let chain = 1; ; chain++) {
    const s = step(board, random, chain, chain === 1 ? moved : []);
    if (!s) return steps;
    steps.push(s);
  }
}

/**
 * Shuffles the gems already on the board (specials keep their powers) into a layout with no match
 * and at least one move. Gives up after a while and deals a fresh board instead, which a board with
 * too few colors for any move can need. Gem ids are kept, so the scene can slide each gem across.
 */
export function reshuffle(board: Board, random: Random, tries = 200): void {
  const gems = board.grid.flat().filter((g): g is Gem => g !== null);
  for (let t = 0; t < tries; t++) {
    for (let i = gems.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)) % (i + 1);
      [gems[i], gems[j]] = [gems[j], gems[i]];
    }
    let i = 0;
    for (let r = 0; r < board.size; r++) for (let c = 0; c < board.size; c++) board.grid[r][c] = gems[i++] ?? null;
    if (findRuns(board).length === 0 && findMove(board)) return;
  }
  const fresh = fillBoard(random, board.size, board.colors);
  // Keep ids rising so no new gem reuses one the scene still knows.
  for (const row of fresh.grid) for (const g of row) if (g) g.id += board.nextId;
  board.grid = fresh.grid;
  board.nextId += fresh.nextId;
}
