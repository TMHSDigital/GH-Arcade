import { cellCenter, type CellRef, type Grid, nearestFreeCell, rowWidth } from './grid';

/**
 * A fired bubble's flight, worked out in one go when it leaves the launcher: straight lines that
 * bounce off the side walls until the bubble touches another bubble or the ceiling, then the cell it
 * settles into. The aim guide runs the same simulation, stopped after the first bounce. No Phaser
 * here. Positions are field pixels (see grid.ts); angles are radians from straight up, positive to the right.
 */

export interface Point {
  x: number;
  y: number;
}

export interface ShotPath {
  /** Start, every wall contact, and the point where the flight stopped. */
  path: Point[];
  bounces: number;
  /** What stopped it: another bubble, the ceiling, or (guide only) the bounce limit. */
  hit: 'bubble' | 'ceiling' | 'limit';
  /** The cell it settles into, or null when it stopped at the bounce limit. */
  landing: CellRef | null;
}

export interface ShotOptions {
  /** Bubble radius. */
  r: number;
  /** Fraction of a bubble width at which two bubbles touch (see COLLIDE in config.ts). */
  collide: number;
  /** Stop at the wall that would be bounce number maxBounces + 1. Defaults to no limit. */
  maxBounces?: number;
  /** Distance moved per collision check. */
  step?: number;
}

/** Keeps an aim angle inside the allowed fan. */
export function clampAim(angle: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, angle));
}

/** The aim angle from the launcher toward a point, clamped. Points below the launcher aim sideways. */
export function aimAt(from: Point, to: Point, limit: number): number {
  return clampAim(Math.atan2(to.x - from.x, from.y - to.y), limit);
}

/** Flies a bubble from `start` at `angle` through the field and reports where it ends up. */
export function simulateShot(grid: Grid, start: Point, angle: number, opts: ShotOptions): ShotPath {
  const { r, collide } = opts;
  const maxBounces = opts.maxBounces ?? Infinity;
  const step = opts.step ?? r / 4;
  const width = grid.cols * 2 * r;
  const rowH = r * Math.sqrt(3);
  const touch = (2 * r * collide) ** 2;
  let dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  let { x, y } = start;
  const path: Point[] = [{ x, y }];
  let bounces = 0;

  const land = (hit: 'bubble' | 'ceiling'): ShotPath => {
    path.push({ x, y });
    return { path, bounces, hit, landing: nearestFreeCell(grid, x, y, r) };
  };

  // A bubble needs about width / |dx| steps per wall; this is far more than any real flight.
  for (let i = 0; i < 20000; i++) {
    let nx = x + dx * step;
    let ny = y + dy * step;
    const wall = nx < r ? r : nx > width - r ? width - r : null;
    if (wall !== null && dx !== 0) {
      // Find the exact wall contact so the path (and the guide) bends at the right spot.
      const t = (wall - x) / dx;
      const contact = { x: wall, y: y + dy * t };
      if (contact.y <= r) {
        x = contact.x;
        y = r;
        return land('ceiling');
      }
      if (bounces >= maxBounces) {
        path.push(contact);
        return { path, bounces, hit: 'limit', landing: null };
      }
      bounces++;
      path.push(contact);
      dx = -dx;
      nx = wall + dx * (step - t);
      ny = contact.y + dy * (step - t);
    }
    x = nx;
    y = ny;
    if (y <= r) {
      y = r;
      return land('ceiling');
    }
    // Only rows near the bubble can touch it.
    const near = Math.round((y - r) / rowH);
    for (let row = Math.max(0, near - 1); row <= Math.min(grid.rows - 1, near + 1); row++) {
      for (let col = 0; col < rowWidth(grid, row); col++) {
        if (grid.cells[row][col] === null) continue;
        const c = cellCenter(grid, row, col, r);
        if ((c.x - x) ** 2 + (c.y - y) ** 2 < touch) return land('bubble');
      }
    }
  }
  return land('ceiling');
}

/** Total length of a path. */
export function pathLength(path: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return total;
}

/** The point `distance` along a path, clamped to its ends. */
export function pointAlong(path: readonly Point[], distance: number): Point {
  let left = Math.max(0, distance);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len) {
      const t = len === 0 ? 0 : left / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= len;
  }
  const last = path[path.length - 1];
  return { x: last.x, y: last.y };
}
