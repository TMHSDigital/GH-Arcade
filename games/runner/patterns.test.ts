import { describe, expect, it } from 'vitest';
import { ACCELERATION, MAX_SPEED, START_SPEED } from './config';
import { MAX_PATTERN_LEVEL, nextPlacement, PATTERNS, type Piece, speedAtDistance } from './patterns';
import { dailyRng } from '../../shared/rng';

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

describe('nextPlacement', () => {
  it('only picks patterns the speed has unlocked', () => {
    for (let r = 0; r < 1; r += 0.05) {
      expect(nextPlacement(START_SPEED, () => r).pattern.minLevel).toBe(0);
      expect(nextPlacement(START_SPEED + 110, () => r).pattern.minLevel).toBeLessThanOrEqual(1);
    }
  });

  it('can pick every pattern at top speed', () => {
    const seen = new Set(PATTERNS.map((_, i) => nextPlacement(MAX_SPEED, () => (i + 0.5) / PATTERNS.length).pattern));
    expect(seen.size).toBe(PATTERNS.length);
  });

  it('stretches the pattern and the clear ground after it with speed', () => {
    const slow = nextPlacement(START_SPEED, () => 0);
    expect(slow.stretch).toBe(1);
    expect(slow.gap).toBe(160);
    expect(nextPlacement(START_SPEED, () => 0.999999).gap).toBe(320);
    const fast = nextPlacement(START_SPEED * 2, () => 0);
    expect(fast.stretch).toBe(2);
    expect(fast.gap).toBe(320);
  });

  it('lays out the same course for the same day', () => {
    const course = (day: string) => {
      const rng = dailyRng('runner', day);
      let at = 0;
      return Array.from({ length: 40 }, () => {
        const { pattern, stretch, gap } = nextPlacement(speedAtDistance(at), rng.next);
        at += pattern.length * stretch + gap;
        return [PATTERNS.indexOf(pattern), at];
      });
    };
    expect(course('2026-11-13')).toEqual(course('2026-11-13'));
    expect(course('2026-11-14')).not.toEqual(course('2026-11-13'));
  });
});

describe('speedAtDistance', () => {
  it('starts at the starting speed and never passes the top speed', () => {
    expect(speedAtDistance(0)).toBe(START_SPEED);
    expect(speedAtDistance(-50)).toBe(START_SPEED);
    expect(speedAtDistance(1e9)).toBe(MAX_SPEED);
  });

  it('matches a run that accelerates steadily over time', () => {
    // After t seconds: speed = START + A*t, distance = START*t + A*t*t/2.
    for (const t of [1, 10, 30]) {
      const distance = START_SPEED * t + (ACCELERATION * t * t) / 2;
      expect(speedAtDistance(distance)).toBeCloseTo(START_SPEED + ACCELERATION * t, 6);
    }
  });
});
