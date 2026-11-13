import {
  CHASER_SPEED,
  CHASER_SPEED_MAX,
  CHASER_SPEED_STEP,
  COLS,
  EYES_SPEED,
  HOUSE_SPEED,
  MODE_SCHEDULE,
  POINTS_CHASER,
  RUNNER_SPEED,
  RUNNER_SPEED_MAX,
  RUNNER_SPEED_STEP,
  SCARED_SPEED,
  SCARED_TIME,
  SCARED_TIME_MIN,
  SCARED_TIME_STEP,
  TUNNEL_SPEED,
} from './config';
import { type Dir, DIRS, HOUSE_EXIT, OPPOSITE, open, TUNNEL_ROW, VEC } from './maze';

/**
 * Pure Neon Maze chase rules: how fast everyone moves, where each chaser is heading, which way it
 * turns at a junction, and when it touches the runner. No Phaser here, so the rules can be tested;
 * the scene owns timing, movement between cells, drawing and sound.
 */

export interface Point {
  x: number;
  y: number;
}

/** Anything that walks the grid. Positions are in cells; whole numbers are cell centers. */
export interface Mover extends Point {
  dir: Dir | null;
}

export type ChaserKind = 'hunter' | 'ambusher' | 'flanker' | 'drifter';
export type ChaserState = 'house' | 'leaving' | 'active' | 'eyes' | 'entering';

/** The part of a chaser the rules need. */
export interface ChaserCore extends Mover {
  kind: ChaserKind;
  state: ChaserState;
  scared: boolean;
  /** Where it retreats to in scatter phases. */
  corner: Point;
}

/** Cells per second for the runner; a little faster each level, up to a cap. */
export function runnerSpeed(level: number): number {
  return Math.min(RUNNER_SPEED + RUNNER_SPEED_STEP * (level - 1), RUNNER_SPEED_MAX);
}

/** Cells per second for a chaser, by what it is doing; out in the maze it speeds up with the level. */
export function chaserSpeed(ch: ChaserCore, level: number): number {
  if (ch.state === 'eyes' || ch.state === 'entering') return EYES_SPEED;
  if (ch.state === 'house' || ch.state === 'leaving') return HOUSE_SPEED;
  if (ch.y === TUNNEL_ROW && (ch.x < 5 || ch.x > COLS - 6)) return TUNNEL_SPEED;
  if (ch.scared) return SCARED_SPEED;
  return Math.min(CHASER_SPEED + CHASER_SPEED_STEP * (level - 1), CHASER_SPEED_MAX);
}

/** How long a power cell keeps the chasers scared; shorter each level, down to a floor. */
export function scaredSeconds(level: number): number {
  return Math.max(SCARED_TIME_MIN, SCARED_TIME - SCARED_TIME_STEP * (level - 1));
}

/**
 * The mode schedule alternates scatter and chase, starting with scatter; once it runs out the
 * chasers hunt for good. `modeIndex` is the position in MODE_SCHEDULE.
 */
export function isScatter(modeIndex: number): boolean {
  return modeIndex < MODE_SCHEDULE.length && modeIndex % 2 === 0;
}

export interface ChaseContext {
  /** The runner's nearest cell. */
  runner: Point;
  /** The way the runner is facing. */
  facing: Dir;
  /** The hunter's position, which the flanker plays off. */
  hunter: Point;
  scatter: boolean;
}

/** Each chaser reads the runner differently, which is what makes them hard to shake as a group. */
export function targetFor(ch: ChaserCore, ctx: ChaseContext): Point {
  if (ch.state === 'eyes') return HOUSE_EXIT;
  if (ctx.scatter) return ch.corner;
  const r = ctx.runner;
  const f = VEC[ctx.facing];
  switch (ch.kind) {
    case 'hunter':
      // Straight at the runner.
      return r;
    case 'ambusher':
      // Four cells ahead of the runner, to cut it off.
      return { x: r.x + f.x * 4, y: r.y + f.y * 4 };
    case 'flanker': {
      // The hunter's position mirrored through a point two cells ahead of the runner.
      const pivot = { x: r.x + f.x * 2, y: r.y + f.y * 2 };
      return { x: pivot.x * 2 - ctx.hunter.x, y: pivot.y * 2 - ctx.hunter.y };
    }
    case 'drifter':
      // Chases from a distance, then loses its nerve within eight cells and heads for its corner.
      return (ch.x - r.x) ** 2 + (ch.y - r.y) ** 2 > 64 ? r : ch.corner;
  }
}

/** The ways a mover at a cell center can go without reversing: open neighbours, in DIRS order. */
export function directionOptions(m: Mover): Dir[] {
  const back = m.dir ? OPPOSITE[m.dir] : null;
  return DIRS.filter((d) => d !== back && open(m.x + VEC[d].x, m.y + VEC[d].y));
}

/**
 * The option that ends up closest to the target in a straight line (ties go to the earlier
 * direction in DIRS). Chasers never look further ahead than this, which is why they can be led
 * around corners.
 */
export function chooseDirection(m: Point, target: Point, options: readonly Dir[]): Dir {
  let best = options[0];
  let bestDist = Infinity;
  for (const d of options) {
    const dist = (m.x + VEC[d].x - target.x) ** 2 + (m.y + VEC[d].y - target.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

/** True when a chaser and the runner overlap enough to count as a catch, across the tunnel wrap too. */
export function touches(ch: Point, runner: Point): boolean {
  const dx = Math.abs(ch.x - runner.x);
  return Math.min(dx, COLS - dx) < 0.6 && Math.abs(ch.y - runner.y) < 0.6;
}

/** Points for catching a scared chaser: doubles with each one caught on the same power cell. */
export function catchPoints(streak: number): number {
  return POINTS_CHASER * 2 ** streak;
}
