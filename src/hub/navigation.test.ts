import { describe, expect, it } from 'vitest';
import { stepIndex, steppedValue } from './navigation';

describe('stepIndex', () => {
  it('starts at the first control when nothing is chosen yet', () => {
    expect(stepIndex(5, -1, 1)).toBe(0);
    expect(stepIndex(5, -1, -1)).toBe(0);
  });

  it('moves one control at a time and stops at both ends', () => {
    expect(stepIndex(5, 0, 1)).toBe(1);
    expect(stepIndex(5, 3, -1)).toBe(2);
    expect(stepIndex(5, 4, 1)).toBe(4);
    expect(stepIndex(5, 0, -1)).toBe(0);
  });

  it('has nowhere to go in an empty list', () => {
    expect(stepIndex(0, -1, 1)).toBe(-1);
  });
});

describe('steppedValue', () => {
  it('moves by one step', () => {
    expect(steppedValue(50, 0, 100, 5, 1)).toBe(55);
    expect(steppedValue(50, 0, 100, 5, -1)).toBe(45);
  });

  it('stays inside the range', () => {
    expect(steppedValue(100, 0, 100, 5, 1)).toBe(100);
    expect(steppedValue(0, 0, 100, 5, -1)).toBe(0);
    expect(steppedValue(150, 80, 150, 10, 1)).toBe(150);
  });

  it('keeps to the step grid, measured from the minimum', () => {
    expect(steppedValue(83, 80, 150, 10, 1)).toBe(90);
    expect(steppedValue(87, 80, 150, 10, -1)).toBe(80);
  });

  it('treats a missing step as 1', () => {
    expect(steppedValue(3, 0, 10, 0, 1)).toBe(4);
  });
});
