import { COIN_POINTS, GROUND_Y, LEDGE_FORGIVENESS, PLAYER_H, PLAYER_W, PX_PER_METRE, SLIDE_H } from './config';

/**
 * Pure Neon Runner rules: where the runner can stand, what counts as a hit, coin pickup and the
 * score. No Phaser here, so the rules can be tested; the scene owns input, physics timing, drawing
 * and sound. All x positions are world x (the runner's feet are centred on `worldX`).
 */

export interface Block {
  x: number;
  w: number;
  h: number;
}
export interface Drone {
  x: number;
  w: number;
}
export interface Gap {
  x: number;
  w: number;
}
export interface Coin {
  x: number;
  y: number;
  taken: boolean;
}
export interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** Drones hover with their underside here: you can't run under, but you can slide under. */
export const DRONE_BOTTOM = GROUND_Y - 30;
export const DRONE_H = 22;
/** Half the width and height of a coin's pickup box. */
const COIN_REACH = 9;

/** True when the runner is over a hole in the floor. */
export function gapUnder(worldX: number, gaps: readonly Gap[]): boolean {
  // Fall only when the whole foot span is over the hole, so clipping an edge is forgiven.
  const left = worldX - PLAYER_W / 2 + 6;
  const right = worldX + PLAYER_W / 2 - 6;
  return gaps.some((g) => left > g.x && right < g.x + g.w);
}

/** The runner's hit box, with feet at `y`. Sliding makes it low and long. */
export function playerBox(worldX: number, y: number, sliding: boolean): Box {
  const h = sliding ? SLIDE_H : PLAYER_H;
  const w = sliding ? PLAYER_H * 0.9 : PLAYER_W;
  // A few pixels of forgiveness on every side.
  return { l: worldX - w / 2 + 4, r: worldX + w / 2 - 4, t: y - h + 4, b: y - 2 };
}

/** True while a drone is above a sliding runner, who must stay ducked until it has passed. */
export function droneOverhead(worldX: number, drones: readonly Drone[]): boolean {
  const l = worldX - PLAYER_H * 0.45;
  const r = worldX + PLAYER_H * 0.45;
  return drones.some((d) => r > d.x && l < d.x + d.w);
}

export function hitsObstacle(p: Box, blocks: readonly Block[], drones: readonly Drone[]): boolean {
  for (const b of blocks) {
    if (p.r > b.x && p.l < b.x + b.w && p.b > GROUND_Y - b.h) return true;
  }
  for (const d of drones) {
    if (p.r > d.x && p.l < d.x + d.w && p.t < DRONE_BOTTOM && p.b > DRONE_BOTTOM - DRONE_H) return true;
  }
  return false;
}

export function touchesCoin(p: Box, c: Coin): boolean {
  return c.x + COIN_REACH > p.l && c.x - COIN_REACH < p.r && c.y + COIN_REACH > p.t && c.y - COIN_REACH < p.b;
}

/**
 * True when the runner, having moved from `prevY` to `y` this step, comes to rest on the floor.
 * Only from above: once the feet have dropped into a gap the far edge is a wall, not a floor.
 */
export function landsOnGround(overGap: boolean, prevY: number, y: number, vy: number): boolean {
  const fromAbove = prevY <= GROUND_Y + LEDGE_FORGIVENESS;
  return !overGap && fromAbove && y >= GROUND_Y && vy >= 0;
}

/** Still below the floor when the gap ends: the runner hits the far wall instead of sinking through the ground. */
export function hitsGapWall(overGap: boolean, y: number): boolean {
  return !overGap && y > GROUND_Y + LEDGE_FORGIVENESS;
}

export function metresRun(distance: number): number {
  return Math.floor(distance / PX_PER_METRE);
}

export function runScore(distance: number, coinsTaken: number): number {
  return metresRun(distance) + coinsTaken * COIN_POINTS;
}
