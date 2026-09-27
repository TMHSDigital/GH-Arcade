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
