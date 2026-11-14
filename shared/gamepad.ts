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

/** What a gamepad's vibration actuator is asked to play: a short dual-motor rumble. */
export interface RumbleEffect {
  duration: number;
  strongMagnitude: number;
  weakMagnitude: number;
}

/** Longest single rumble, in ms, so a stray call can never leave a gamepad buzzing. */
export const RUMBLE_MAX_MS = 600;

/**
 * The effect for a rumble of `strength` (0 to 1) lasting `ms`. The heavy motor carries the hit and
 * the light one runs a little softer; out-of-range values are clamped.
 */
export function rumbleEffect(strength: number, ms: number): RumbleEffect {
  const s = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0;
  const duration = Number.isFinite(ms) ? Math.min(RUMBLE_MAX_MS, Math.max(0, Math.round(ms))) : 0;
  return { duration, strongMagnitude: s, weakMagnitude: s * 0.6 };
}

/**
 * Plays a rumble on a gamepad's vibration actuator. Gamepads and browsers without one (and effects
 * that are refused) are ignored, so callers never need to check.
 */
export function playRumble(actuator: unknown, strength: number, ms: number): void {
  const effect = rumbleEffect(strength, ms);
  if (effect.duration === 0 || effect.strongMagnitude === 0) return;
  const play = (actuator as { playEffect?: (type: string, params: RumbleEffect) => unknown } | null | undefined)?.playEffect;
  if (typeof play !== 'function') return;
  try {
    const result = play.call(actuator, 'dual-rumble', effect);
    if (result instanceof Promise) result.catch(() => undefined);
  } catch {
    /* unsupported effect or a gamepad that has just gone away */
  }
}

/** How far the left stick must move before it counts as a digital direction press. */
export const STICK_PRESS = 0.5;
