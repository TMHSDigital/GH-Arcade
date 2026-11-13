/**
 * Standard gamepad layout, shared by the games (shared/controls.ts) and the hub's navigation.
 * No Phaser here, so the hub can use it without loading the game engine.
 */

/** Button indices in the W3C "standard" gamepad mapping. */
export const PAD = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  back: 8,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** How far the left stick must move before it counts as a digital direction press. */
export const STICK_PRESS = 0.5;
