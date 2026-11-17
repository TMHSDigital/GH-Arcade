import {
  BARREL_LEN,
  BLAST_R,
  DIRECT_BONUS,
  FALL_DAMAGE_PER_PX,
  FALL_SAFE,
  GRAVITY,
  MAX_DAMAGE,
  MAX_FALL_DAMAGE,
  MAX_FLIGHT_S,
  MAX_POWER,
  MIN_POWER,
  OUT_MARGIN,
  POWER_SPEED,
  SAFE_LAUNCH_S,
  SIM_DT,
  TANK_CENTER_Y,
  TANK_FOOT,
  TANK_H,
  TANK_HIT_R,
  WIDTH,
  WIND_ACCEL,
} from './config';
import { type Heights, surfaceAt } from './terrain';

/** A tank as the rules see it: its base (bottom center) on the ground. */
export interface TankPos {
  x: number;
  y: number;
}

export interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds since launch. */
  t: number;
}

export type ImpactKind = 'ground' | 'tank' | 'out' | 'timeout';

export interface Impact {
  kind: ImpactKind;
  x: number;
  y: number;
  /** Index of the tank hit, for a direct hit. */
  tank?: number;
}

/** Angles are in degrees from the right-hand horizontal: 0 points right, 90 straight up, 180 left. */
export function clampAngle(angle: number): number {
  return Math.min(180, Math.max(0, angle));
}

export function clampPower(power: number): number {
  return Math.min(MAX_POWER, Math.max(MIN_POWER, power));
}

/** Where the barrel turns: the top of the hull. */
export function pivotOf(tank: TankPos): { x: number; y: number } {
  return { x: tank.x, y: tank.y - TANK_H };
}

/** The tip of the barrel, where shells leave. */
export function muzzleOf(tank: TankPos, angle: number): { x: number; y: number } {
  const p = pivotOf(tank);
  const rad = (angle * Math.PI) / 180;
  return { x: p.x + Math.cos(rad) * BARREL_LEN, y: p.y - Math.sin(rad) * BARREL_LEN };
}

export function centerOf(tank: TankPos): { x: number; y: number } {
  return { x: tank.x, y: tank.y - TANK_CENTER_Y };
}

/** A shell leaving `tank`'s barrel at `angle` degrees and `power` points. */
export function launch(tank: TankPos, angle: number, power: number): Shell {
  const m = muzzleOf(tank, angle);
  const rad = (angle * Math.PI) / 180;
  const speed = clampPower(power) * POWER_SPEED;
  return { x: m.x, y: m.y, vx: Math.cos(rad) * speed, vy: -Math.sin(rad) * speed, t: 0 };
}

/** Moves a shell one step: wind pushes it sideways and gravity pulls it down. */
export function stepShell(s: Shell, wind: number, dt: number = SIM_DT): void {
  s.vx += wind * WIND_ACCEL * dt;
  s.vy += GRAVITY * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.t += dt;
}

/**
 * What the shell has hit at its current position, if anything: a tank (any but the shooter's own
 * right after launch), the ground, the sides of the world, or nothing yet. There is no ceiling, so a
 * shell can fly off the top and come back down.
 */
export function checkImpact(s: Shell, heights: Heights, tanks: readonly TankPos[], shooter: number): Impact | null {
  for (let i = 0; i < tanks.length; i++) {
    if (i === shooter && s.t < SAFE_LAUNCH_S) continue;
    // The same test as centerOf and a distance, without allocating: this runs every step of every planned shot.
    const dx = s.x - tanks[i].x;
    const dy = s.y - (tanks[i].y - TANK_CENTER_Y);
    if (dx * dx + dy * dy <= TANK_HIT_R * TANK_HIT_R) return { kind: 'tank', x: s.x, y: s.y, tank: i };
  }
  if (s.x >= 0 && s.x <= heights.length - 1 && s.y >= surfaceAt(heights, s.x)) {
    return { kind: 'ground', x: s.x, y: surfaceAt(heights, s.x) };
  }
  if (s.x < -OUT_MARGIN || s.x > WIDTH + OUT_MARGIN) return { kind: 'out', x: s.x, y: s.y };
  if (s.t >= MAX_FLIGHT_S) return { kind: 'timeout', x: s.x, y: s.y };
  return null;
}

/**
 * Flies a shot to the end and reports where it landed. `onStep` sees every position along the way
 * (the trajectory hint uses it; return false to stop early). `dt` can be coarser for quick estimates.
 */
export function simulateShot(
  heights: Heights,
  tanks: readonly TankPos[],
  shooter: number,
  angle: number,
  power: number,
  wind: number,
  opts: { dt?: number; onStep?: (s: Shell) => boolean | void } = {},
): Impact {
  const s = launch(tanks[shooter], angle, power);
  const dt = opts.dt ?? SIM_DT;
  for (;;) {
    stepShell(s, wind, dt);
    const hit = checkImpact(s, heights, tanks, shooter);
    if (hit) return hit;
    if (opts.onStep && opts.onStep(s) === false) return { kind: 'timeout', x: s.x, y: s.y };
  }
}

/**
 * Damage to a tank from an explosion `dist` pixels from its center: full at the center, falling off
 * linearly to nothing at the edge of the blast (measured from the tank's edge). A direct hit adds a bonus.
 */
export function blastDamage(dist: number, direct = false): number {
  const d = Math.max(0, dist - TANK_HIT_R);
  if (d >= BLAST_R) return 0;
  return Math.round(MAX_DAMAGE * (1 - d / BLAST_R)) + (direct ? DIRECT_BONUS : 0);
}

/** Where a tank at x comes to rest: on the highest ground under its tracks. */
export function restY(heights: Heights, x: number): number {
  return Math.min(surfaceAt(heights, x - TANK_FOOT), surfaceAt(heights, x), surfaceAt(heights, x + TANK_FOOT));
}

/** HP lost by a tank that dropped `drop` pixels when the ground went from under it. */
export function fallDamage(drop: number): number {
  if (drop <= FALL_SAFE) return 0;
  return Math.min(MAX_FALL_DAMAGE, Math.round((drop - FALL_SAFE) * FALL_DAMAGE_PER_PX));
}

/** The wind for a turn, from a [0, 1) random number: a whole number from -WIND_MAX to WIND_MAX. */
export function rollWind(r: number, max: number): number {
  return Math.round((r * 2 - 1) * max);
}
