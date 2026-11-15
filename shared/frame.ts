/**
 * The longest frame a game simulates, in milliseconds. A frame that took longer (a stalled tab, a
 * slow phone, a debugger pause) is played as if it took this long, so nothing jumps through a wall
 * or takes several steps before the player can react. No Phaser here.
 */
export const MAX_FRAME_MS = 50;

/** A frame's length capped at `maxMs`, in milliseconds. Anything that is not a positive time counts as 0. */
export function frameMs(deltaMs: number, maxMs: number = MAX_FRAME_MS): number {
  return deltaMs > 0 ? Math.min(deltaMs, maxMs) : 0;
}

/**
 * A frame's length in seconds, capped at `maxMs`: what a scene's update() multiplies speeds by.
 *
 *   update(_time: number, deltaMs: number): void {
 *     const dt = frameSeconds(deltaMs);
 */
export function frameSeconds(deltaMs: number, maxMs: number = MAX_FRAME_MS): number {
  return frameMs(deltaMs, maxMs) / 1000;
}
