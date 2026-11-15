import type Phaser from 'phaser';

/** Swipe and tap gestures. Kept apart from the on-screen controls in touch.ts so it needs no Phaser at run time. */

export type SwipeDir = 'left' | 'right' | 'up' | 'down' | 'tap';

export interface SwipeOptions {
  /** Minimum travel in game pixels before a drag counts as a swipe. */
  threshold?: number;
  /**
   * Fire repeatedly during one long drag (each time it travels another `threshold`),
   * e.g. for steering a snake or sliding a block several columns. Taps still fire on release.
   */
  continuous?: boolean;
  /** Only track touches that start inside this area (e.g. one half of the screen per player). */
  region?: Phaser.Geom.Rectangle;
  /**
   * Touches that start while this returns true are dropped, release included. Pass the pause state
   * (`() => this.pause.isPaused`) so the tap that chooses RESUME does not also reach the game.
   */
  ignore?: () => boolean;
}

/**
 * Calls `handler` with the swipe direction, or 'tap' for a short press without movement.
 * Each finger is tracked separately, so two players can swipe at the same time.
 */
export function onSwipe(scene: Phaser.Scene, handler: (dir: SwipeDir) => void, opts: SwipeOptions = {}): void {
  const threshold = opts.threshold ?? 30;
  const active = new Map<number, { x: number; y: number; swiped: boolean }>();

  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    if (opts.ignore?.()) return;
    if (opts.region && !opts.region.contains(p.x, p.y)) return;
    active.set(p.id, { x: p.x, y: p.y, swiped: false });
  });
  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
    const t = active.get(p.id);
    if (!t || !p.isDown || !opts.continuous) return;
    const dir = direction(p.x - t.x, p.y - t.y, threshold);
    if (dir) {
      handler(dir);
      t.swiped = true;
      t.x = p.x;
      t.y = p.y;
    }
  });
  const release = (p: Phaser.Input.Pointer) => {
    const t = active.get(p.id);
    if (!t) return;
    active.delete(p.id);
    const dir = direction(p.x - t.x, p.y - t.y, threshold);
    if (dir) handler(dir);
    else if (!t.swiped) handler('tap');
  };
  // A finger that slides off the canvas edge still completes its swipe.
  scene.input.on('pointerup', release);
  scene.input.on('pointerupoutside', release);
}

/**
 * The direction of a drag of (dx, dy), or null when it is shorter than `threshold` on both axes (a
 * tap). The longer axis wins, and an exact diagonal counts as vertical. Exported for its test.
 */
export function direction(dx: number, dy: number, threshold: number): SwipeDir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
