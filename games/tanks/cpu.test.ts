import { describe, expect, it } from 'vitest';
import { createRng } from '../../shared/rng';
import { blastDamage, centerOf, simulateShot, type TankPos } from './ballistics';
import { CPU_PROFILES, WIDTH, WIND_MAX } from './config';
import { bestShot, cpuShot } from './cpu';
import { generateTerrain } from './terrain';

const flat = (y = 450): number[] => Array.from({ length: WIDTH + 1 }, () => y);
const duel = (): TankPos[] => [
  { x: 150, y: 450 },
  { x: 650, y: 450 },
];

/** Damage a shot from `shooter` does to `target`. */
function damageTo(heights: number[], tanks: TankPos[], shooter: number, target: number, angle: number, power: number, wind: number): number {
  const hit = simulateShot(heights, tanks, shooter, angle, power, wind);
  if (hit.kind === 'out' || hit.kind === 'timeout') return 0;
  const c = centerOf(tanks[target]);
  return blastDamage(Math.hypot(hit.x - c.x, hit.y - c.y), hit.kind === 'tank' && hit.tank === target);
}

/** Shots the CPU needs to damage its target, up to `limit`. */
function shotsToHit(level: keyof typeof CPU_PROFILES, seed: string, heights: number[], tanks: TankPos[], wind: number, limit: number): number {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < limit; attempt++) {
    const aim = cpuShot(heights, tanks, 1, 0, wind, CPU_PROFILES[level], attempt, rng.next);
    if (damageTo(heights, tanks, 1, 0, aim.angle, aim.power, wind) > 0) return attempt + 1;
  }
  return Infinity;
}

describe('bestShot', () => {
  it('finds a hit on flat ground from either side', () => {
    const h = flat();
    const t = duel();
    const right = bestShot(h, t, 0, 1, 0);
    expect(right.angle).toBeLessThan(90);
    expect(damageTo(h, t, 0, 1, right.angle, right.power, 0)).toBeGreaterThan(30);
    const left = bestShot(h, t, 1, 0, 0);
    expect(left.angle).toBeGreaterThan(90);
    expect(damageTo(h, t, 1, 0, left.angle, left.power, 0)).toBeGreaterThan(30);
  });

  it('allows for the wind', () => {
    const h = flat();
    const t = duel();
    for (const wind of [-WIND_MAX, WIND_MAX]) {
      const aim = bestShot(h, t, 1, 0, wind);
      expect(damageTo(h, t, 1, 0, aim.angle, aim.power, wind)).toBeGreaterThan(30);
    }
  });

  it('gets over a hill on generated ground', () => {
    for (const seed of ['ridge', 'valley', 'bumps']) {
      const h = generateTerrain(createRng(seed).next, WIDTH);
      const t: TankPos[] = [
        { x: 120, y: h[120] },
        { x: 680, y: h[680] },
      ];
      const aim = bestShot(h, t, 1, 0, 3);
      expect(damageTo(h, t, 1, 0, aim.angle, aim.power, 3)).toBeGreaterThan(0);
    }
  });
});

describe('cpuShot', () => {
  it('the hard CPU hits on flat ground with no wind within a few shots', () => {
    for (const seed of ['one', 'two', 'three', 'four', 'five']) {
      expect(shotsToHit('hard', seed, flat(), duel(), 0, 3)).toBeLessThanOrEqual(3);
    }
  });

  it('misses more on easy than on hard', () => {
    const spread = (level: keyof typeof CPU_PROFILES) => {
      const rng = createRng(`spread-${level}`);
      const plan = bestShot(flat(), duel(), 1, 0, 0);
      let total = 0;
      for (let i = 0; i < 8; i++) {
        const aim = cpuShot(flat(), duel(), 1, 0, 0, CPU_PROFILES[level], 0, rng.next);
        total += Math.abs(aim.angle - plan.angle) + Math.abs(aim.power - plan.power);
      }
      return total;
    };
    expect(spread('easy')).toBeGreaterThan(spread('normal'));
    expect(spread('normal')).toBeGreaterThan(spread('hard'));
  });

  it('zeroes in: later shots stray less than the first', () => {
    const plan = bestShot(flat(), duel(), 1, 0, 0);
    // A random source stuck at its top end gives the largest error every time.
    const worst = () => 0.999;
    const first = cpuShot(flat(), duel(), 1, 0, 0, CPU_PROFILES.easy, 0, worst);
    const third = cpuShot(flat(), duel(), 1, 0, 0, CPU_PROFILES.easy, 2, worst);
    expect(Math.abs(third.power - plan.power)).toBeLessThan(Math.abs(first.power - plan.power));
  });
});
