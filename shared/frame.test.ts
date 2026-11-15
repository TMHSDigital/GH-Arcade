import { describe, expect, it } from 'vitest';
import { frameMs, frameSeconds, MAX_FRAME_MS } from './frame';

describe('frameSeconds', () => {
  it('turns a normal frame into seconds', () => {
    expect(frameSeconds(16)).toBeCloseTo(0.016);
    expect(frameSeconds(MAX_FRAME_MS)).toBeCloseTo(0.05);
  });

  it('caps a long frame', () => {
    expect(frameSeconds(400)).toBeCloseTo(MAX_FRAME_MS / 1000);
    expect(frameSeconds(400, 40)).toBeCloseTo(0.04);
  });

  it('treats a frame with no positive length as no time at all', () => {
    expect(frameSeconds(0)).toBe(0);
    expect(frameSeconds(-5)).toBe(0);
    expect(frameSeconds(Number.NaN)).toBe(0);
  });
});

describe('frameMs', () => {
  it('is the same cap in milliseconds', () => {
    expect(frameMs(16)).toBe(16);
    expect(frameMs(900)).toBe(MAX_FRAME_MS);
    expect(frameMs(900, 40)).toBe(40);
    expect(frameMs(-1)).toBe(0);
  });
});
