import { describe, expect, it } from 'vitest';
import { type Dir, DIRS, HoldRepeat } from './hold-repeat';

/** Drives a HoldRepeat with a set of keys held down and the ones newly pressed this frame. */
function driver(delayMs = 200, rateMs = 50) {
  const repeat = new HoldRepeat<Dir>(DIRS, { delayMs, rateMs });
  const down = new Set<Dir>();
  return {
    repeat,
    press(...keys: Dir[]): Dir[] {
      for (const k of keys) down.add(k);
      return repeat.update(16, (k) => keys.includes(k), (k) => down.has(k));
    },
    release(...keys: Dir[]) {
      for (const k of keys) down.delete(k);
    },
    /** Frames of `dt` ms with nothing newly pressed; all steps in order. */
    hold(ms: number, dt = 10, canRepeat = true): Dir[] {
      const steps: Dir[] = [];
      for (let t = 0; t < ms; t += dt) steps.push(...repeat.update(dt, () => false, (k) => down.has(k), canRepeat));
      return steps;
    },
  };
}

describe('HoldRepeat', () => {
  it('steps once on a tap and never repeats after release', () => {
    const d = driver();
    expect(d.press('left')).toEqual(['left']);
    d.release('left');
    expect(d.hold(1000)).toEqual([]);
  });

  it('repeats a held key after the delay, then at the rate', () => {
    const d = driver(200, 50);
    d.press('right');
    expect(d.hold(190)).toEqual([]);
    expect(d.hold(20)).toEqual(['right']);
    // 200 ms more at a 50 ms rate is four more steps.
    expect(d.hold(200)).toEqual(['right', 'right', 'right', 'right']);
  });

  it('fires at most one step for a long frame, then keeps its cadence', () => {
    const d = driver(200, 50);
    d.press('down');
    expect(d.hold(210, 210)).toEqual(['down']);
    // The 10 ms overshoot is kept: the next step is 40 ms away.
    expect(d.hold(30)).toEqual([]);
    expect(d.hold(10)).toEqual(['down']);
  });

  it('repeats the last key pressed, and falls back to another still held', () => {
    const d = driver(200, 50);
    d.press('right');
    expect(d.press('up')).toEqual(['up']);
    expect(d.repeat.current).toBe('up');
    expect(d.hold(210)).toContain('up');
    // Let go of Up while Right is still held: Right takes over after the delay.
    d.release('up');
    expect(d.hold(10)).toEqual([]);
    expect(d.repeat.current).toBe('right');
    expect(d.hold(190)).toEqual([]);
    expect(d.hold(20)).toEqual(['right']);
  });

  it('steps every key pressed in the same frame', () => {
    const d = driver();
    expect(d.press('up', 'left')).toEqual(['left', 'up']);
  });

  it('holds a repeat back while it is not allowed, and fires it once allowed', () => {
    const d = driver(200, 50);
    d.press('left');
    expect(d.hold(500, 10, false)).toEqual([]);
    expect(d.hold(10)).toEqual(['left']);
  });

  it('forgets the held key on reset', () => {
    const d = driver();
    d.press('left');
    d.repeat.reset();
    expect(d.hold(1000)).toEqual([]);
  });

  it('works for keys other than directions', () => {
    const repeat = new HoldRepeat<Dir | 'undo'>([...DIRS, 'undo'], { delayMs: 100, rateMs: 50 });
    expect(repeat.update(16, (k) => k === 'undo', (k) => k === 'undo')).toEqual(['undo']);
    expect(repeat.update(110, () => false, (k) => k === 'undo')).toEqual(['undo']);
  });
});
