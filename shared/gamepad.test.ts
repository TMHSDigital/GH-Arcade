import { describe, expect, it, vi } from 'vitest';
import { playRumble, RUMBLE_MAX_MS, rumbleEffect } from './gamepad';

describe('rumbleEffect', () => {
  it('drives the heavy motor at the given strength and the light one softer', () => {
    expect(rumbleEffect(0.5, 120)).toEqual({ duration: 120, strongMagnitude: 0.5, weakMagnitude: 0.3 });
  });

  it('clamps strength and duration', () => {
    expect(rumbleEffect(4, 5000)).toEqual({ duration: RUMBLE_MAX_MS, strongMagnitude: 1, weakMagnitude: 0.6 });
    expect(rumbleEffect(-1, -20)).toEqual({ duration: 0, strongMagnitude: 0, weakMagnitude: 0 });
    expect(rumbleEffect(Number.NaN, Number.NaN)).toEqual({ duration: 0, strongMagnitude: 0, weakMagnitude: 0 });
  });
});

describe('playRumble', () => {
  it('asks the actuator for a dual rumble', () => {
    const playEffect = vi.fn(() => Promise.resolve('complete'));
    playRumble({ playEffect }, 1, 200);
    expect(playEffect).toHaveBeenCalledWith('dual-rumble', { duration: 200, strongMagnitude: 1, weakMagnitude: 0.6 });
  });

  it('does nothing for a rumble with no strength or no length', () => {
    const playEffect = vi.fn();
    playRumble({ playEffect }, 0, 200);
    playRumble({ playEffect }, 1, 0);
    expect(playEffect).not.toHaveBeenCalled();
  });

  it('ignores gamepads without an actuator', () => {
    expect(() => playRumble(undefined, 1, 100)).not.toThrow();
    expect(() => playRumble(null, 1, 100)).not.toThrow();
    expect(() => playRumble({}, 1, 100)).not.toThrow();
  });

  it('swallows an actuator that throws or rejects', async () => {
    expect(() =>
      playRumble(
        {
          playEffect: () => {
            throw new Error('gone');
          },
        },
        1,
        100,
      ),
    ).not.toThrow();
    const rejected = Promise.reject(new Error('not supported'));
    expect(() => playRumble({ playEffect: () => rejected }, 1, 100)).not.toThrow();
    await expect(rejected.catch(() => 'handled')).resolves.toBe('handled');
  });
});
