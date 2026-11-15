import { describe, expect, it } from 'vitest';
import { gridStep, stepIndex, steppedValue } from './navigation';

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

describe('gridStep', () => {
  // Ten cards in rows of four: the last row has two.
  it('goes to the first card when none is focused yet', () => {
    expect(gridStep(10, -1, 1, 0, 4)).toBe(0);
    expect(gridStep(10, -1, 0, -1, 4)).toBe(0);
  });

  it('moves one card sideways and one row up or down', () => {
    expect(gridStep(10, 5, 1, 0, 4)).toBe(6);
    expect(gridStep(10, 5, -1, 0, 4)).toBe(4);
    expect(gridStep(10, 1, 0, 1, 4)).toBe(5);
    expect(gridStep(10, 5, 0, -1, 4)).toBe(1);
  });

  it('stops at the last card going down from the last row', () => {
    expect(gridStep(10, 8, 0, 1, 4)).toBe(9);
    expect(gridStep(10, 7, 0, 1, 4)).toBe(9);
    expect(gridStep(10, 9, 1, 0, 4)).toBe(9);
  });

  it('stops at the first card going up from the first row', () => {
    expect(gridStep(10, 2, 0, -1, 4)).toBe(0);
    expect(gridStep(10, 0, -1, 0, 4)).toBe(0);
  });

  it('has nowhere to go without cards', () => {
    expect(gridStep(0, -1, 1, 0, 4)).toBe(-1);
  });
});
