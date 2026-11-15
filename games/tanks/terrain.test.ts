import { describe, expect, it } from 'vitest';
import { createRng } from '../../shared/rng';
import { FLOOR_Y, TERRAIN_BOTTOM, TERRAIN_TOP, WIDTH } from './config';
import { carveCrater, flattenAt, generateTerrain, isSolid, surfaceAt } from './terrain';

const flat = (y = 400, width = WIDTH): number[] => Array.from({ length: width + 1 }, () => y);

describe('generateTerrain', () => {
  it('gives one height per column, inside the allowed band', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const h = generateTerrain(createRng(seed).next, WIDTH);
      expect(h).toHaveLength(WIDTH + 1);
      for (const y of h) {
        expect(y).toBeGreaterThanOrEqual(TERRAIN_TOP);
        expect(y).toBeLessThanOrEqual(TERRAIN_BOTTOM);
      }
    }
  });

  it('is repeatable from a seed and differs between seeds', () => {
    const a = generateTerrain(createRng(7).next, WIDTH);
    expect(generateTerrain(createRng(7).next, WIDTH)).toEqual(a);
    expect(generateTerrain(createRng(8).next, WIDTH)).not.toEqual(a);
  });

  it('is hilly, not flat, and has no cliffs', () => {
    const h = generateTerrain(createRng('hills').next, WIDTH);
    expect(Math.max(...h) - Math.min(...h)).toBeGreaterThan(30);
    for (let x = 1; x < h.length; x++) expect(Math.abs(h[x] - h[x - 1])).toBeLessThan(8);
  });
});

describe('surfaceAt and isSolid', () => {
  it('interpolates between columns and clamps at the ends', () => {
    const h = flat(400, 10);
    h[3] = 300;
    expect(surfaceAt(h, 2.5)).toBeCloseTo(350);
    expect(surfaceAt(h, -20)).toBe(400);
    expect(surfaceAt(h, 99)).toBe(400);
  });

  it('treats the surface and everything under it as ground', () => {
    const h = flat(400);
    expect(isSolid(h, 100, 399)).toBe(false);
    expect(isSolid(h, 100, 400)).toBe(true);
    expect(isSolid(h, 100, 550)).toBe(true);
  });
});

describe('carveCrater', () => {
  it('digs a round bowl centred on the blast', () => {
    const h = flat(400);
    const changed = carveCrater(h, 300, 400, 30);
    expect(changed).toEqual([271, 329]);
    expect(h[300]).toBeCloseTo(430);
    // Halfway out, the bowl is shallower: sqrt(30^2 - 15^2).
    expect(h[315]).toBeCloseTo(400 + Math.sqrt(900 - 225));
    expect(h[269]).toBe(400);
    expect(h[331]).toBe(400);
  });

  it('drops ground hanging over the hole into it (no overhangs)', () => {
    const h = flat(400);
    // A blast deep underground still lowers the surface to the bottom of the circle.
    carveCrater(h, 300, 480, 20);
    expect(h[300]).toBeCloseTo(500);
  });

  it('leaves ground already below the hole alone and reports nothing for a miss in the air', () => {
    const h = flat(400);
    expect(carveCrater(h, 300, 200, 30)).toBeNull();
    expect(h).toEqual(flat(400));
  });

  it('never digs below the floor, and stays inside the map at the edges', () => {
    const h = flat(FLOOR_Y - 5);
    carveCrater(h, 0, FLOOR_Y, 40);
    expect(Math.max(...h)).toBeLessThanOrEqual(FLOOR_Y);
    expect(h).toHaveLength(WIDTH + 1);
    carveCrater(h, WIDTH + 10, 400, 40);
    expect(h).toHaveLength(WIDTH + 1);
  });
});

describe('flattenAt', () => {
  it('levels a pad at the average height', () => {
    const h = flat(400, 20);
    h[9] = 380;
    h[11] = 420;
    flattenAt(h, 10, 2);
    for (let x = 8; x <= 12; x++) expect(h[x]).toBeCloseTo(400);
  });
});
