import { FLOOR_Y, TERRAIN_BOTTOM, TERRAIN_TOP } from './config';

/**
 * The ground as a heightmap: one surface y per pixel column, from x = 0 to x = width. Larger y is
 * lower on screen. Everything below the surface is solid.
 */
export type Heights = number[];

export interface TerrainOptions {
  top?: number;
  bottom?: number;
}

/**
 * Rolling hills from a few layered sine waves with random phases, plus a random hump or dip in the
 * middle so most maps have something to shoot over. `next` is a [0, 1) random source (rng.next).
 */
export function generateTerrain(next: () => number, width: number, opts: TerrainOptions = {}): Heights {
  const top = opts.top ?? TERRAIN_TOP;
  const bottom = opts.bottom ?? TERRAIN_BOTTOM;
  const mid = (top + bottom) / 2 + (next() - 0.5) * 40;
  const waves = [
    { amp: 40 + next() * 40, freq: 1 + next() * 1.2 },
    { amp: 14 + next() * 22, freq: 3 + next() * 2.5 },
    { amp: 4 + next() * 8, freq: 8 + next() * 5 },
  ].map((w) => ({ ...w, phase: next() * Math.PI * 2 }));
  // Positive raises the middle into a hill, negative sinks it into a valley.
  const hump = (next() * 1.4 - 0.4) * 90;
  const spread = width * (0.12 + next() * 0.08);
  const heights: Heights = [];
  for (let x = 0; x <= width; x++) {
    let y = mid;
    for (const w of waves) y += w.amp * Math.sin((x / width) * Math.PI * 2 * w.freq + w.phase);
    const d = (x - width / 2) / spread;
    y -= hump * Math.exp(-d * d);
    heights.push(Math.min(bottom, Math.max(top, y)));
  }
  return heights;
}

/** Ground height at any x, interpolated between columns and clamped to the map's ends. */
export function surfaceAt(heights: Heights, x: number): number {
  const last = heights.length - 1;
  if (x <= 0) return heights[0];
  if (x >= last) return heights[last];
  const i = Math.floor(x);
  const f = x - i;
  return heights[i] * (1 - f) + heights[i + 1] * f;
}

/** True when the point is in or under the ground. */
export function isSolid(heights: Heights, x: number, y: number): boolean {
  return y >= surfaceAt(heights, x);
}

/**
 * Blows a round hole of radius `r` centred on (cx, cy). A heightmap has no overhangs, so any ground
 * left hanging over the hole drops into it: each column ends up no higher than the bottom of the
 * circle there. Ground already below the circle is untouched. Never digs below `floor`. Returns the
 * first and last column changed, or null when nothing was removed.
 */
export function carveCrater(heights: Heights, cx: number, cy: number, r: number, floor = FLOOR_Y): [number, number] | null {
  const from = Math.max(0, Math.ceil(cx - r));
  const to = Math.min(heights.length - 1, Math.floor(cx + r));
  let first = -1;
  let last = -1;
  for (let x = from; x <= to; x++) {
    const dx = x - cx;
    const bottom = Math.min(floor, cy + Math.sqrt(Math.max(0, r * r - dx * dx)));
    if (heights[x] < bottom) {
      heights[x] = bottom;
      if (first < 0) first = x;
      last = x;
    }
  }
  return first < 0 ? null : [first, last];
}

/** Levels a pad of ground around x (at its average height), so a tank starts on a flat spot. */
export function flattenAt(heights: Heights, x: number, half: number): void {
  const from = Math.max(0, Math.round(x - half));
  const to = Math.min(heights.length - 1, Math.round(x + half));
  let sum = 0;
  for (let i = from; i <= to; i++) sum += heights[i];
  const level = sum / (to - from + 1);
  for (let i = from; i <= to; i++) heights[i] = level;
}
