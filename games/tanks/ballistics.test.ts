import { describe, expect, it } from 'vitest';
import {
  BLAST_R,
  DIRECT_BONUS,
  FALL_SAFE,
  GRAVITY,
  MAX_DAMAGE,
  MAX_FALL_DAMAGE,
  MAX_POWER,
  MIN_POWER,
  POWER_SPEED,
  TANK_FOOT,
  TANK_HIT_R,
  WIDTH,
  WIND_ACCEL,
  WIND_MAX,
} from './config';
import {
  blastDamage,
  centerOf,
  checkImpact,
  clampAngle,
  clampPower,
  fallDamage,
  launch,
  muzzleOf,
  restY,
  rollWind,
  simulateShot,
  stepShell,
  type TankPos,
} from './ballistics';

const flat = (y = 450): number[] => Array.from({ length: WIDTH + 1 }, () => y);
const tanks = (): TankPos[] => [
  { x: 150, y: 450 },
  { x: 650, y: 450 },
];

describe('launch and stepShell', () => {
  it('leaves the barrel tip at the power speed in the barrel direction', () => {
    const t = { x: 100, y: 400 };
    const s = launch(t, 90, 50);
    const m = muzzleOf(t, 90);
    expect(s.x).toBeCloseTo(m.x);
    expect(s.y).toBeCloseTo(m.y);
    expect(s.vx).toBeCloseTo(0);
    expect(s.vy).toBeCloseTo(-50 * POWER_SPEED);
    expect(launch(t, 0, 50).vx).toBeCloseTo(50 * POWER_SPEED);
    expect(launch(t, 180, 50).vx).toBeCloseTo(-50 * POWER_SPEED);
  });

  it('applies gravity downwards and wind sideways', () => {
    const s = { x: 0, y: 0, vx: 0, vy: 0, t: 0 };
    stepShell(s, 5, 0.5);
    expect(s.vy).toBeCloseTo(GRAVITY * 0.5);
    expect(s.vx).toBeCloseTo(5 * WIND_ACCEL * 0.5);
    expect(s.t).toBeCloseTo(0.5);
    const calm = { x: 0, y: 0, vx: 0, vy: 0, t: 0 };
    stepShell(calm, 0, 0.5);
    expect(calm.vx).toBe(0);
  });

  it('follows the textbook range on flat ground without wind', () => {
    const h = flat(450);
    const shooter = { x: 100, y: 450 };
    const power = 60;
    const hit = simulateShot(h, [shooter], 0, 45, power, 0);
    const v = power * POWER_SPEED;
    const m = muzzleOf(shooter, 45);
    // Range from the muzzle height down to the ground, solved from the equations of motion.
    const vx = v * Math.SQRT1_2;
    const vy = v * Math.SQRT1_2;
    const drop = 450 - m.y;
    const t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * drop)) / GRAVITY;
    expect(hit.kind).toBe('ground');
    expect(hit.x).toBeCloseTo(m.x + vx * t, -1);
  });

  it('is pushed downwind', () => {
    const h = flat(450);
    const calm = simulateShot(h, tanks(), 0, 50, 55, 0);
    const tail = simulateShot(h, tanks(), 0, 50, 55, WIND_MAX);
    const head = simulateShot(h, tanks(), 0, 50, 55, -WIND_MAX);
    expect(tail.x).toBeGreaterThan(calm.x + 20);
    expect(head.x).toBeLessThan(calm.x - 20);
  });
});

describe('checkImpact', () => {
  it('reports a direct hit on a tank before the ground under it', () => {
    const c = centerOf({ x: 650, y: 450 });
    const hit = checkImpact({ x: c.x + TANK_HIT_R - 1, y: c.y, vx: 0, vy: 0, t: 1 }, flat(), tanks(), 0);
    expect(hit).toMatchObject({ kind: 'tank', tank: 1 });
  });

  it('ignores the shooter right after launch, but not later', () => {
    const c = centerOf({ x: 150, y: 450 });
    expect(checkImpact({ x: c.x, y: c.y, vx: 0, vy: 0, t: 0.05 }, flat(), tanks(), 0)).toBeNull();
    expect(checkImpact({ x: c.x, y: c.y, vx: 0, vy: 0, t: 2 }, flat(), tanks(), 0)).toMatchObject({ kind: 'tank', tank: 0 });
  });

  it('lands on the ground, flies out sideways, and lets shells go over the top', () => {
    expect(checkImpact({ x: 400, y: 451, vx: 0, vy: 0, t: 1 }, flat(), tanks(), 0)).toMatchObject({ kind: 'ground', x: 400, y: 450 });
    expect(checkImpact({ x: -100, y: 100, vx: 0, vy: 0, t: 1 }, flat(), tanks(), 0)?.kind).toBe('out');
    expect(checkImpact({ x: 400, y: -500, vx: 0, vy: 0, t: 1 }, flat(), tanks(), 0)).toBeNull();
  });

  it('gives up on a shell that never comes down', () => {
    expect(simulateShot(flat(), tanks(), 0, 90, MAX_POWER, 0, { onStep: (s) => s.t < 0.5 }).kind).toBe('timeout');
  });
});

describe('blastDamage', () => {
  it('is full at the center and fades to nothing at the edge of the blast', () => {
    expect(blastDamage(0)).toBe(MAX_DAMAGE);
    expect(blastDamage(TANK_HIT_R)).toBe(MAX_DAMAGE);
    expect(blastDamage(TANK_HIT_R + BLAST_R / 2)).toBe(Math.round(MAX_DAMAGE / 2));
    expect(blastDamage(TANK_HIT_R + BLAST_R)).toBe(0);
    expect(blastDamage(1000)).toBe(0);
  });

  it('adds a bonus for a direct hit', () => {
    expect(blastDamage(0, true)).toBe(MAX_DAMAGE + DIRECT_BONUS);
  });

  it('never grows with distance', () => {
    let last = Infinity;
    for (let d = 0; d < 120; d += 3) {
      const dmg = blastDamage(d);
      expect(dmg).toBeLessThanOrEqual(last);
      last = dmg;
    }
  });
});

describe('settling', () => {
  it('rests a tank on the highest ground under its tracks', () => {
    const h = flat(450);
    h[200 + TANK_FOOT] = 440;
    expect(restY(h, 200)).toBe(440);
    expect(restY(flat(450), 200)).toBe(450);
  });

  it('charges a little HP for longer falls only, up to a cap', () => {
    expect(fallDamage(0)).toBe(0);
    expect(fallDamage(FALL_SAFE)).toBe(0);
    expect(fallDamage(FALL_SAFE + 20)).toBeGreaterThan(0);
    expect(fallDamage(10000)).toBe(MAX_FALL_DAMAGE);
  });
});

describe('limits', () => {
  it('clamps angle and power', () => {
    expect(clampAngle(-5)).toBe(0);
    expect(clampAngle(200)).toBe(180);
    expect(clampPower(0)).toBe(MIN_POWER);
    expect(clampPower(500)).toBe(MAX_POWER);
  });

  it('rolls whole-number wind inside the limit', () => {
    expect(rollWind(0, WIND_MAX)).toBe(-WIND_MAX);
    expect(rollWind(0.5, WIND_MAX)).toBe(0);
    expect(rollWind(0.9999, WIND_MAX)).toBe(WIND_MAX);
  });
});
