/**
 * Obstacle pattern library for Neon Runner. Each pattern lays out obstacles, gaps and coins
 * relative to its start (in world pixels). `minLevel` gates harder patterns until the runner is faster.
 *
 * Kinds:
 *   block  - ground barrier to jump over (w x h)
 *   drone  - hovering bar you slide under (or jump clean over)
 *   gap    - hole in the floor (w wide)
 *   coins  - a row or arc of coins
 */

import { ACCELERATION, MAX_SPEED, START_SPEED } from './config';

export type Piece =
  | { kind: 'block'; x: number; w: number; h: number }
  | { kind: 'drone'; x: number; w: number }
  | { kind: 'gap'; x: number; w: number }
  | { kind: 'coins'; x: number; count: number; y: number; arc?: number };

export interface Pattern {
  /** Difficulty tier (0 = from the start, higher tiers unlock as speed rises). */
  minLevel: number;
  /** Total length in world pixels at base speed; scaled by speed when placed. */
  length: number;
  pieces: Piece[];
}

/** Highest difficulty tier. The runner's speed maps to a level from 0 to this; every level needs a pattern. */
export const MAX_PATTERN_LEVEL = 3;

/** Coin row height above the ground for a coin you collect while running. */
const RUN = 30;
/** Coin height that needs a jump. */
const AIR = 130;

export const PATTERNS: Pattern[] = [
  { minLevel: 0, length: 260, pieces: [{ kind: 'block', x: 0, w: 32, h: 44 }, { kind: 'coins', x: -20, count: 3, y: AIR, arc: 40 }] },
  { minLevel: 0, length: 300, pieces: [{ kind: 'coins', x: 0, count: 6, y: RUN }] },
  { minLevel: 0, length: 280, pieces: [{ kind: 'gap', x: 0, w: 110 }, { kind: 'coins', x: 10, count: 3, y: AIR, arc: 50 }] },
  { minLevel: 0, length: 300, pieces: [{ kind: 'drone', x: 0, w: 90 }, { kind: 'coins', x: 5, count: 4, y: 12 }] },
  { minLevel: 1, length: 380, pieces: [{ kind: 'block', x: 0, w: 30, h: 40 }, { kind: 'block', x: 190, w: 30, h: 50 }] },
  { minLevel: 1, length: 300, pieces: [{ kind: 'block', x: 0, w: 38, h: 92 }, { kind: 'coins', x: -30, count: 4, y: AIR + 40, arc: 40 }] },
  { minLevel: 1, length: 340, pieces: [{ kind: 'gap', x: 0, w: 160 }, { kind: 'coins', x: 20, count: 4, y: AIR + 10, arc: 60 }] },
  { minLevel: 2, length: 420, pieces: [{ kind: 'block', x: 0, w: 30, h: 46 }, { kind: 'drone', x: 210, w: 110 }] },
  { minLevel: 2, length: 420, pieces: [{ kind: 'drone', x: 0, w: 90 }, { kind: 'gap', x: 200, w: 120 }] },
  { minLevel: 2, length: 460, pieces: [{ kind: 'gap', x: 0, w: 120 }, { kind: 'block', x: 230, w: 32, h: 56 }, { kind: 'coins', x: 90, count: 5, y: AIR + 30, arc: 40 }] },
  { minLevel: 3, length: 460, pieces: [{ kind: 'gap', x: 0, w: 210 }, { kind: 'coins', x: 30, count: 5, y: AIR + 60, arc: 70 }] },
  { minLevel: 3, length: 520, pieces: [{ kind: 'drone', x: 0, w: 80 }, { kind: 'drone', x: 180, w: 80 }, { kind: 'block', x: 380, w: 30, h: 50 }] },
  { minLevel: 3, length: 480, pieces: [{ kind: 'block', x: 0, w: 30, h: 50 }, { kind: 'gap', x: 150, w: 130 }, { kind: 'block', x: 340, w: 30, h: 44 }] },
];

/** Speed gained per difficulty tier: the runner reaches tier 1 at START_SPEED + 110, and so on. */
const SPEED_PER_LEVEL = 110;

export interface Placement {
  pattern: Pattern;
  /** Scale for the pattern's x positions and length: gaps stretch with speed so reaction time stays fair. */
  stretch: number;
  /** Clear ground after the pattern, in world pixels (already stretched). */
  gap: number;
}

/**
 * Picks the next pattern for a runner moving at `speed`, and the clear ground that follows it.
 * `random` returns 0..1 like Math.random; a daily challenge passes its seeded generator.
 */
export function nextPlacement(speed: number, random: () => number = Math.random): Placement {
  const level = Math.max(0, Math.min(MAX_PATTERN_LEVEL, Math.floor((speed - START_SPEED) / SPEED_PER_LEVEL)));
  const pool = PATTERNS.filter((p) => p.minLevel <= level);
  const pattern = pool[Math.floor(random() * pool.length)];
  const stretch = speed / START_SPEED;
  return { pattern, stretch, gap: (160 + Math.floor(random() * 161)) * stretch };
}

/**
 * The runner's speed after covering `distance` world pixels: the same curve the game follows over
 * time (constant acceleration up to MAX_SPEED), worked out from the distance alone. A daily
 * challenge uses it so the course never depends on a player's frame rate.
 */
export function speedAtDistance(distance: number): number {
  return Math.min(MAX_SPEED, Math.sqrt(START_SPEED ** 2 + 2 * ACCELERATION * Math.max(0, distance)));
}
