import {
  BALL_SIZE,
  BOTTOM,
  CPU_ERROR,
  CPU_REACT,
  CPU_SPEED,
  MAX_ANGLE,
  MAX_SPEED,
  PADDLE_H,
  PADDLE_W,
  POINTS_TO_WIN,
  SERVE_SPEED,
  SPEEDUP,
  SPIN,
  TOP,
  WIDTH,
} from './config';

/**
 * Neon Pong's rules, free of Phaser so they can be unit tested: where the ball will arrive, how the
 * CPU paddle chases it, what a paddle hit does to the ball, and how a solo match is scored.
 */

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
}

/** The parts of a paddle the rules need. `side` is -1 for the left paddle and 1 for the right. */
export interface PaddleCore {
  side: -1 | 1;
  x: number;
  y: number;
  /** How fast the paddle itself is moving, which adds spin to a hit. */
  vy: number;
  /** CPU only: its current aim offset. */
  aimError: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** The height at which the ball will cross `atX`, wall bounces included. */
export function predictY(b: Ball, atX: number): number {
  if (b.vx === 0) return b.y;
  const t = (atX - b.x) / b.vx;
  const span = BOTTOM - TOP - BALL_SIZE;
  // Unfold the wall bounces: reflect the straight-line position back into the playfield.
  let y = b.y + b.vy * t - (TOP + BALL_SIZE / 2);
  y = ((y % (2 * span)) + 2 * span) % (2 * span);
  if (y > span) y = 2 * span - y;
  return y + TOP + BALL_SIZE / 2;
}

/**
 * Where the CPU paddle moves to this frame. It tracks where the ball will arrive (bounces
 * included), with a little error and a speed limit, and drifts back to the middle otherwise.
 */
export function cpuMove(p: PaddleCore, b: Ball, live: boolean, dt: number): number {
  let target = (TOP + BOTTOM) / 2;
  // It only starts reading the ball once it crosses into its own half, so steep fast shots can beat it.
  const inHalf = p.side > 0 ? b.x > WIDTH * CPU_REACT : b.x < WIDTH * (1 - CPU_REACT);
  if (live && Math.sign(b.vx) === p.side && inHalf) target = predictY(b, p.x) + p.aimError;
  const diff = target - p.y;
  if (Math.abs(diff) < 6) return p.y;
  return p.y + clamp(diff, -CPU_SPEED * dt, CPU_SPEED * dt);
}

/** How far off the CPU aims after a hit: `roll` is -1 to 1, and faster balls make it less precise. */
export function cpuAimError(ballSpeed: number, roll: number): number {
  return roll * CPU_ERROR * Math.min(ballSpeed / SERVE_SPEED, 1.8);
}

/** True when the ball, travelling toward the paddle, has reached its face without already being past it. */
export function touchesPaddle(b: Ball, p: PaddleCore): boolean {
  const half = BALL_SIZE / 2;
  const face = p.x - (p.side * PADDLE_W) / 2;
  const incoming = Math.sign(b.vx) === p.side;
  const reached = p.side < 0 ? b.x - half <= face : b.x + half >= face;
  const behind = p.side < 0 ? b.x < p.x - PADDLE_W : b.x > p.x + PADDLE_W;
  return incoming && reached && !behind && Math.abs(b.y - p.y) <= PADDLE_H / 2 + half;
}

/**
 * Sends the ball back off a paddle (changing `b` in place). Where it hits the paddle sets the
 * angle, the paddle's own movement adds a little spin, and every hit speeds the ball up to a cap.
 */
export function bounceOffPaddle(b: Ball, p: PaddleCore): void {
  const offset = clamp((b.y - p.y) / (PADDLE_H / 2), -1, 1);
  const angle = offset * MAX_ANGLE;
  b.speed = Math.min(b.speed * SPEEDUP, MAX_SPEED);
  b.vx = -p.side * Math.cos(angle) * b.speed;
  b.vy = Math.sin(angle) * b.speed + p.vy * SPIN;
  b.x = p.x - p.side * (PADDLE_W / 2 + BALL_SIZE / 2 + 1);
}

/** A solo match's score: points for every goal, plus a win bonus that grows with the margin. */
export function matchScore(yours: number, theirs: number, won: boolean): number {
  return yours * 100 + (won ? 500 + (POINTS_TO_WIN - theirs) * 100 : 0);
}
