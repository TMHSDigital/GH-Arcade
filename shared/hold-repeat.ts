/**
 * "First press moves once, holding repeats after a delay", for cursors and grid moves. One copy of
 * the rule, so every grid game feels the same and a fix reaches them all. No Phaser here.
 *
 *   const repeat = new HoldRepeat(DIRS, { delayMs: 260, rateMs: 70 });
 *   for (const dir of repeat.update(dtMs, (d) => c.justPressed(d), (d) => c.isDown(d))) step(dir);
 *
 * - Every key pressed this frame steps once, in the order of `keys`.
 * - The last key pressed is the one that repeats. Released while another key is still held, the
 *   other one takes over, after the delay again.
 * - At most one repeat per update: a long frame does not fire a burst of steps.
 */

export type Dir = 'left' | 'right' | 'up' | 'down';
export const DIRS: readonly Dir[] = ['left', 'right', 'up', 'down'];
/** Column and row offsets of a step in each direction. */
export const DIR_STEP: Readonly<Record<Dir, readonly [number, number]>> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export interface HoldRepeatOptions {
  /** How long a key is held before it repeats, in ms. */
  delayMs: number;
  /** Time between repeats after that, in ms. */
  rateMs: number;
}

export class HoldRepeat<K extends string = Dir> {
  private held: K | null = null;
  /** Time until the held key next repeats, in ms. */
  private wait = 0;

  constructor(
    private readonly keys: readonly K[],
    private readonly options: HoldRepeatOptions,
  ) {}

  /** The key repeating now, or null. */
  get current(): K | null {
    return this.held;
  }

  /**
   * Advances by `dtMs` and returns the steps to take this frame. `canRepeat` false holds a repeat
   * back (the clock still runs), for a game that is busy or in a mode with no repeat; the step fires
   * on the first update after it is allowed again.
   */
  update(dtMs: number, justPressed: (key: K) => boolean, isDown: (key: K) => boolean, canRepeat = true): K[] {
    const steps = this.keys.filter(justPressed);
    if (steps.length) {
      this.held = steps[steps.length - 1];
      this.wait = this.options.delayMs;
      return steps;
    }
    if (this.held !== null && !isDown(this.held)) {
      this.held = this.keys.find(isDown) ?? null;
      this.wait = this.options.delayMs;
      return [];
    }
    if (this.held === null) return [];
    this.wait -= dtMs;
    if (this.wait > 0) return [];
    if (!canRepeat) {
      this.wait = 0;
      return [];
    }
    // Keep the overshoot so the rate holds on average, but after a long frame start the cadence afresh.
    this.wait += this.options.rateMs;
    if (this.wait <= 0) this.wait = this.options.rateMs;
    return [this.held];
  }

  /** Forgets the held key, e.g. on restart, so a key still down from before does not repeat. */
  reset(): void {
    this.held = null;
    this.wait = 0;
  }
}
