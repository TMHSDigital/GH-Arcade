import {
  BASE_SHOTS_PER_DROP,
  CLEAR_BONUS,
  CLEAR_BONUS_PER_LEVEL,
  DROP_POINTS,
  MAX_COLORS,
  MAX_STREAK,
  MIN_SHOTS_PER_DROP,
  POP_POINTS,
  SHOTS_PER_LEVEL,
  START_COLORS,
} from './config';
import { colorsPresent, type Grid } from './grid';

/**
 * Neon Bubbles scoring and difficulty. No Phaser here, so it can be tested; the scene owns input,
 * timing, drawing and sound.
 */

/** Bonus for bubbles that fell in one shot: each one is worth more than the last. */
export function dropScore(count: number): number {
  return (DROP_POINTS * count * (count + 1)) / 2;
}

/** The streak multiplier: consecutive popping shots, capped. */
export function streakMultiplier(streak: number): number {
  return Math.max(1, Math.min(streak, MAX_STREAK));
}

/** Points for one shot: popped and fallen bubbles, times the streak multiplier. */
export function shotScore(popped: number, dropped: number, streak: number): number {
  if (popped === 0) return 0;
  return (popped * POP_POINTS + dropScore(dropped)) * streakMultiplier(streak);
}

/** The level after this many shots and cleared fields. */
export function levelFor(shots: number, clears: number): number {
  return 1 + Math.floor(shots / SHOTS_PER_LEVEL) + clears;
}

/** How many bubble colors are in play at a level: one more every two levels. */
export function colorCount(level: number): number {
  return Math.min(MAX_COLORS, START_COLORS + Math.floor((Math.max(1, level) - 1) / 2));
}

/** Shots in a row without a pop before the ceiling pushes a row down. Fewer as levels rise. */
export function shotsPerDrop(level: number): number {
  return Math.max(MIN_SHOTS_PER_DROP, BASE_SHOTS_PER_DROP - Math.floor((Math.max(1, level) - 1) / 2));
}

/** The bonus for clearing the whole field. */
export function clearBonus(level: number): number {
  return CLEAR_BONUS + CLEAR_BONUS_PER_LEVEL * level;
}

/**
 * The color of a new bubble for the launcher: one still on the field, so every shot can be useful,
 * or any color in play when the field is empty. `random` returns 0..1 like Math.random.
 */
export function pickColor(grid: Grid, colors: number, random: () => number = Math.random): number {
  const present = colorsPresent(grid).filter((c) => c < colors);
  if (present.length === 0) return Math.floor(random() * colors);
  return present[Math.floor(random() * present.length)];
}

/**
 * Replaces any loaded color that is gone from the field after a pop, so the player is never stuck
 * holding a bubble that can match nothing. Leaves the queue alone while the field is empty.
 */
export function refreshQueue(grid: Grid, queue: readonly number[], colors: number, random: () => number = Math.random): number[] {
  const present = colorsPresent(grid);
  if (present.length === 0) return [...queue];
  return queue.map((c) => (present.includes(c) ? c : pickColor(grid, colors, random)));
}
