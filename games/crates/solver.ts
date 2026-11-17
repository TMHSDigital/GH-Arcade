import { DIRS, type Dir, isSolved, liveCells, type Level, type State, step } from './rules';

/**
 * A small move-optimal solver, used by the tests to prove every level can be solved and that its
 * par is the true minimum. Not loaded by the game.
 *
 * It searches push by push (Dijkstra): between pushes the robot just walks, so each edge costs the
 * walk to the crate plus one. Crates are never pushed onto cells from which no target can be
 * reached, or into a 2x2 block that can never move again.
 */

export interface Solution {
  moves: number;
  pushes: number;
  /** The full move list, walking included. */
  path: Dir[];
}

interface Node {
  state: State;
  cost: number;
  pushes: number;
  parent: string | null;
  /** The push that led here: where the robot stood and which way it pushed. */
  via?: { from: number; dir: Dir };
}

const OPPOSITE: Record<Dir, Dir> = { left: 'right', right: 'left', up: 'down', down: 'up' };

/** Distances (and the step taken into each cell) for the robot walking around the crates. */
function walk(level: Level, state: State): { dist: Int32Array; came: (Dir | null)[] } {
  const dist = new Int32Array(level.walls.length).fill(-1);
  const came: (Dir | null)[] = new Array<Dir | null>(level.walls.length).fill(null);
  const blocked = new Set(state.crates);
  dist[state.player] = 0;
  const queue = [state.player];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    for (const d of DIRS) {
      const n = step(level, c, d);
      if (n === -1 || level.walls[n] || blocked.has(n) || dist[n] !== -1) continue;
      dist[n] = dist[c] + 1;
      came[n] = d;
      queue.push(n);
    }
  }
  return { dist, came };
}

/** True when the crate just pushed to `cell` is stuck in a 2x2 block of walls and crates off target. */
function frozenSquare(level: Level, crates: Set<number>, cell: number): boolean {
  const solid = (c: number) => c === -1 || level.walls[c] || crates.has(c);
  const x = cell % level.width;
  const y = Math.floor(cell / level.width);
  for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    const cells: number[] = [];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const cx = x + ox + dx;
      const cy = y + oy + dy;
      cells.push(cx < 0 || cy < 0 || cx >= level.width || cy >= level.height ? -1 : cy * level.width + cx);
    }
    if (!cells.every(solid)) continue;
    if (cells.some((c) => c !== -1 && crates.has(c) && !level.targets.includes(c))) return true;
  }
  return false;
}

const keyOf = (s: State) => `${s.player}:${s.crates.join(',')}`;

/** A minimal binary heap of [cost, key]. */
class Heap {
  private items: [number, string][] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: [number, string]): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, string] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** The fewest-moves solution, or null when there is none (or the search passes `limit` states). */
export function solve(level: Level, limit = 2_000_000): Solution | null {
  const live = liveCells(level);
  const nodes = new Map<string, Node>();
  const done = new Set<string>();
  const heap = new Heap();
  const startKey = keyOf(level.start);
  nodes.set(startKey, { state: level.start, cost: 0, pushes: 0, parent: null });
  heap.push([0, startKey]);

  while (heap.size) {
    const [cost, key] = heap.pop();
    if (done.has(key)) continue;
    const node = nodes.get(key)!;
    if (cost > node.cost) continue;
    done.add(key);
    if (isSolved(level, node.state)) return { moves: cost, pushes: node.pushes, path: rebuild(level, nodes, key) };
    if (done.size > limit) return null;

    const { dist } = walk(level, node.state);
    const crates = new Set(node.state.crates);
    for (const crate of node.state.crates) {
      for (const d of DIRS) {
        const stand = step(level, crate, OPPOSITE[d]);
        const dest = step(level, crate, d);
        if (stand === -1 || dist[stand] < 0 || dest === -1 || level.walls[dest] || crates.has(dest) || !live[dest]) continue;
        const moved = new Set(crates);
        moved.delete(crate);
        moved.add(dest);
        if (frozenSquare(level, moved, dest)) continue;
        const next: State = { player: crate, crates: [...moved].sort((a, b) => a - b) };
        const nextKey = keyOf(next);
        const nextCost = cost + dist[stand] + 1;
        const known = nodes.get(nextKey);
        if (done.has(nextKey) || (known && known.cost <= nextCost)) continue;
        nodes.set(nextKey, { state: next, cost: nextCost, pushes: node.pushes + 1, parent: key, via: { from: stand, dir: d } });
        heap.push([nextCost, nextKey]);
      }
    }
  }
  return null;
}

/** Turns the chain of pushes ending at `key` back into single moves. */
function rebuild(level: Level, nodes: Map<string, Node>, key: string): Dir[] {
  const chain: Node[] = [];
  for (let k: string | null = key; k !== null; k = nodes.get(k)!.parent) chain.push(nodes.get(k)!);
  chain.reverse();
  const path: Dir[] = [];
  for (let i = 1; i < chain.length; i++) {
    const before = chain[i - 1].state;
    const { from, dir } = chain[i].via!;
    const { came } = walk(level, before);
    const steps: Dir[] = [];
    for (let c = from; c !== before.player; ) {
      const d = came[c]!;
      steps.push(d);
      c = step(level, c, OPPOSITE[d]);
    }
    path.push(...steps.reverse(), dir);
  }
  return path;
}
