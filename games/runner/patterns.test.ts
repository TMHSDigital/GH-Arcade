import { describe, expect, it } from 'vitest';
import { MAX_PATTERN_LEVEL, PATTERNS, type Piece } from './patterns';

type Solid = Exclude<Piece, { kind: 'coins' }>;
const isSolid = (p: Piece): p is Solid => p.kind !== 'coins';

describe('runner patterns', () => {
  it('has a pattern available at every level, so the pool is never empty', () => {
    for (let level = 0; level <= MAX_PATTERN_LEVEL; level++) {
      expect(PATTERNS.some((p) => p.minLevel <= level), `level ${level}`).toBe(true);
    }
    expect(PATTERNS.some((p) => p.minLevel === 0)).toBe(true);
  });

  it('keeps every minLevel within the level cap', () => {
    for (const p of PATTERNS) {
      expect(Number.isInteger(p.minLevel)).toBe(true);
      expect(p.minLevel).toBeGreaterThanOrEqual(0);
      expect(p.minLevel).toBeLessThanOrEqual(MAX_PATTERN_LEVEL);
    }
  });

  it.each(PATTERNS.map((p, i) => [i, p] as const))('pattern %i keeps its pieces inside its length', (_i, pattern) => {
    expect(pattern.length).toBeGreaterThan(0);
    expect(pattern.pieces.length).toBeGreaterThan(0);
    for (const piece of pattern.pieces) {
      if (isSolid(piece)) {
        expect(piece.x).toBeGreaterThanOrEqual(0);
        expect(piece.w).toBeGreaterThan(0);
        expect(piece.x + piece.w).toBeLessThanOrEqual(pattern.length);
      } else {
        // Coin rows may start a little before the obstacle they arc over.
        expect(piece.x).toBeLessThan(pattern.length);
        expect(piece.count).toBeGreaterThan(0);
        expect(piece.y).toBeGreaterThan(0);
      }
    }
  });

  it.each(PATTERNS.map((p, i) => [i, p] as const))('pattern %i has no overlapping obstacles', (_i, pattern) => {
    const solids = pattern.pieces.filter(isSolid).sort((a, b) => a.x - b.x);
    for (let i = 1; i < solids.length; i++) {
      expect(solids[i].x).toBeGreaterThanOrEqual(solids[i - 1].x + solids[i - 1].w);
    }
  });

  it('gives blocks a positive height', () => {
    for (const pattern of PATTERNS) {
      for (const piece of pattern.pieces) if (piece.kind === 'block') expect(piece.h).toBeGreaterThan(0);
    }
  });
});
