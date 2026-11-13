import { describe, expect, it } from 'vitest';
import { ALIEN_KINDS, ALIEN_POINTS, ART, ROW_KINDS } from './art';

describe('Star Siege art', () => {
  const sprites = Object.entries(ART) as [string, readonly (readonly string[])[]][];

  it.each(sprites)('%s frames are rectangular bitmaps of # and .', (_name, frames) => {
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.length).toBeGreaterThan(0);
      for (const row of frame) {
        expect(row).toHaveLength(frame[0].length);
        expect(row).toMatch(/^[#.]+$/);
      }
    }
  });

  it.each(sprites)('%s frames all have the same size', (_name, frames) => {
    for (const frame of frames) {
      expect(frame).toHaveLength(frames[0].length);
      expect(frame[0]).toHaveLength(frames[0][0].length);
    }
  });

  it('every alien has two marching frames', () => {
    for (const kind of ALIEN_KINDS) expect(ART[kind]).toHaveLength(2);
  });
});

describe('Star Siege scoring', () => {
  it('every row kind is a known alien with a points value', () => {
    expect(ROW_KINDS.length).toBeGreaterThan(0);
    for (const kind of ROW_KINDS) {
      expect(ALIEN_KINDS).toContain(kind);
      expect(ALIEN_POINTS[kind]).toBeGreaterThan(0);
    }
  });

  it('rows nearer the top are worth at least as much', () => {
    const points = ROW_KINDS.map((k) => ALIEN_POINTS[k]);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });
});
