import {
  BALL_RADIUS,
  BOOST_ACCEL,
  CELL,
  CHARGE_SECONDS,
  CUP_PULL,
  CUP_PULL_RANGE,
  CUP_RADIUS,
  CUP_SPEED,
  MAX_SHOT,
  MAX_SPEED,
  MIN_SHOT,
  ROLL_DECEL,
  ROLL_DRAG,
  SAND_DECEL,
  SAND_DRAG,
  STEP,
  STOP_SPEED,
  WALL_BOUNCE,
} from './config';
import { BOOST_DIRS, type Hole, isSolidTile, type MoverDef, type Point, tileOf } from './holes';

/**
 * The ball's physics: rolling friction, sand, boost pads, the cup, and circle-against-box bounces off
 * walls and moving blockers. No Phaser here; the scene calls step() at a fixed rate, and the tests
 * (and the par check) call the same code.
 */

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The hardest wall or blocker hit during the last step, as the speed into it (0 for none). */
  hit: number;
}

/** What a step ended with: still rolling, come to rest, dropped in the cup, or into the water. */
export type StepEvent = 'roll' | 'rest' | 'sunk' | 'water';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far along its track a blocker is at time `t`, 0 to 1, easing at both ends. */
function moverOffset(m: MoverDef, t: number): number {
  return (1 - Math.cos(2 * Math.PI * (t / m.period + (m.phase ?? 0)))) / 2;
}

/** Where a blocker is at time `t` seconds, written into `out` (the scene reuses one rect every frame). */
export function moverRect(m: MoverDef, t: number, out: Rect = { x: 0, y: 0, w: 0, h: 0 }): Rect {
  const k = moverOffset(m, t);
  out.x = m.x + m.dx * k;
  out.y = m.y + m.dy * k;
  out.w = m.w;
  out.h = m.h;
  return out;
}

/** A blocker's velocity at time `t`, in px/s. */
export function moverVelocity(m: MoverDef, t: number, out: Point = { x: 0, y: 0 }): Point {
  const dk = (Math.PI / m.period) * Math.sin(2 * Math.PI * (t / m.period + (m.phase ?? 0)));
  out.x = m.dx * dk;
  out.y = m.dy * dk;
  return out;
}

/** The tile under a point in px. */
export function tileAt(hole: Hole, x: number, y: number): string {
  return tileOf(hole.grid, Math.floor(x / CELL), Math.floor(y / CELL));
}

/** The launch velocity of a shot along `angle` (radians) at `power` (0 to 1). */
export function shotVelocity(angle: number, power: number): { vx: number; vy: number } {
  const p = Math.min(1, Math.max(0, power));
  const speed = MIN_SHOT + (MAX_SHOT - MIN_SHOT) * p;
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

/** Power while a charge is held for `seconds`: it rises to full, falls back to nothing, and repeats. */
export function chargePower(seconds: number): number {
  const t = (Math.max(0, seconds) / CHARGE_SECONDS) % 2;
  return t <= 1 ? t : 2 - t;
}

/** A drag from the shot's anchor to the pointer as a shot: it flies the opposite way, harder the further it is pulled. */
export function dragShot(dx: number, dy: number, range: number): { angle: number; power: number } {
  return { angle: Math.atan2(-dy, -dx), power: Math.min(1, Math.hypot(dx, dy) / range) };
}

/**
 * Pushes the ball out of a box and bounces it off. The box may be moving (a blocker), in which case
 * the bounce is taken relative to it, so a blocker that runs into a resting ball knocks it away.
 */
function pushOut(ball: Ball, rx: number, ry: number, rw: number, rh: number, mvx: number, mvy: number): void {
  const r = BALL_RADIUS;
  const cx = Math.min(Math.max(ball.x, rx), rx + rw);
  const cy = Math.min(Math.max(ball.y, ry), ry + rh);
  let nx = ball.x - cx;
  let ny = ball.y - cy;
  const d2 = nx * nx + ny * ny;
  if (d2 >= r * r) return;
  let push: number;
  if (d2 > 0) {
    const d = Math.sqrt(d2);
    nx /= d;
    ny /= d;
    push = r - d;
  } else {
    // The center is inside the box (only a fast blocker can do this): leave by the nearest side.
    const left = ball.x - rx;
    const right = rx + rw - ball.x;
    const top = ball.y - ry;
    const bottom = ry + rh - ball.y;
    const m = Math.min(left, right, top, bottom);
    nx = m === left ? -1 : m === right ? 1 : 0;
    ny = nx !== 0 ? 0 : m === top ? -1 : 1;
    push = m + r;
  }
  ball.x += nx * push;
  ball.y += ny * push;
  const vn = (ball.vx - mvx) * nx + (ball.vy - mvy) * ny;
  if (vn < 0) {
    ball.vx -= (1 + WALL_BOUNCE) * vn * nx;
    ball.vy -= (1 + WALL_BOUNCE) * vn * ny;
    ball.hit = Math.max(ball.hit, -vn);
  }
}

// Reused on every collision check, which runs several times per step.
const scratch: Rect = { x: 0, y: 0, w: 0, h: 0 };
const scratchV: Point = { x: 0, y: 0 };

function collide(hole: Hole, ball: Ball, t: number): void {
  const r = BALL_RADIUS;
  const c0 = Math.floor((ball.x - r) / CELL);
  const c1 = Math.floor((ball.x + r) / CELL);
  const r0 = Math.floor((ball.y - r) / CELL);
  const r1 = Math.floor((ball.y + r) / CELL);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (isSolidTile(tileOf(hole.grid, col, row))) pushOut(ball, col * CELL, row * CELL, CELL, CELL, 0, 0);
    }
  }
  for (const m of hole.movers) {
    const rect = moverRect(m, t, scratch);
    const v = moverVelocity(m, t, scratchV);
    pushOut(ball, rect.x, rect.y, rect.w, rect.h, v.x, v.y);
  }
}

/** Advances the ball by one fixed step at time `t` (seconds since the hole began, for the blockers). */
export function step(hole: Hole, ball: Ball, t: number, dt: number = STEP): StepEvent {
  ball.hit = 0;
  const ch = tileAt(hole, ball.x, ball.y);
  if (ch === 'w') return 'water';

  const boost = BOOST_DIRS[ch];
  if (boost) {
    ball.vx += boost.x * BOOST_ACCEL * dt;
    ball.vy += boost.y * BOOST_ACCEL * dt;
  }

  let speed = Math.hypot(ball.vx, ball.vy);
  const toCupX = hole.cup.x - ball.x;
  const toCupY = hole.cup.y - ball.y;
  const cupDist = Math.hypot(toCupX, toCupY);
  if (cupDist < CUP_RADIUS && speed < CUP_SPEED) return 'sunk';
  const pulled = cupDist < CUP_PULL_RANGE && cupDist > 0 && speed < CUP_SPEED;
  if (pulled) {
    ball.vx += (toCupX / cupDist) * CUP_PULL * dt;
    ball.vy += (toCupY / cupDist) * CUP_PULL * dt;
    speed = Math.hypot(ball.vx, ball.vy);
  }

  if (speed > 0) {
    const sand = ch === 's';
    const decel = (sand ? SAND_DECEL : ROLL_DECEL) + (sand ? SAND_DRAG : ROLL_DRAG) * speed;
    const next = Math.min(MAX_SPEED, Math.max(0, speed - decel * dt));
    ball.vx *= next / speed;
    ball.vy *= next / speed;
    speed = next;
  }

  // Small moves per collision check, so a fast ball never passes through a wall.
  const moves = Math.max(1, Math.ceil((speed * dt) / (BALL_RADIUS * 0.5)));
  const sub = dt / moves;
  for (let i = 0; i < moves; i++) {
    ball.x += ball.vx * sub;
    ball.y += ball.vy * sub;
    collide(hole, ball, t);
  }

  // A ball on a pad or on the lip of the cup is still going somewhere.
  if (!boost && !pulled && Math.hypot(ball.vx, ball.vy) < STOP_SPEED) {
    ball.vx = 0;
    ball.vy = 0;
    return 'rest';
  }
  return 'roll';
}

export interface ShotResult {
  event: Exclude<StepEvent, 'roll'>;
  x: number;
  y: number;
  /** Seconds the shot took. */
  time: number;
}

/** Plays a whole shot from (x, y) with the blockers starting at time `t0`, and reports how it ended. */
export function simulateShot(hole: Hole, x: number, y: number, angle: number, power: number, t0 = 0, maxSeconds = 30): ShotResult {
  const ball: Ball = { x, y, ...shotVelocity(angle, power), hit: 0 };
  const steps = Math.ceil(maxSeconds / STEP);
  for (let i = 1; i <= steps; i++) {
    const event = step(hole, ball, t0 + i * STEP);
    if (event !== 'roll') return { event, x: ball.x, y: ball.y, time: i * STEP };
  }
  return { event: 'rest', x: ball.x, y: ball.y, time: maxSeconds };
}
