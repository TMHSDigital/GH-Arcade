import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, CELL, CHARGE_SECONDS, CUP_SPEED, MAX_SHOT, MIN_SHOT, STEP, WALL_BOUNCE } from './config';
import { HOLES, type MoverDef, parseHole, tileOf } from './holes';
import { type Ball, chargePower, dragShot, moverRect, moverVelocity, shotVelocity, simulateShot, step, tileAt } from './physics';

/** A long open lane: row 2, from col 1 to col 18, walled all round. The cup is tucked at the far end. */
const LANE = parseHole({
  name: 'LANE',
  par: 2,
  rows: ['', '####################', '#T................O#', '####################'],
});

const ball = (x: number, y: number, vx = 0, vy = 0): Ball => ({ x, y, vx, vy, hit: 0 });

/** Steps a ball until it stops doing `'roll'`, returning the event and the steps it took. */
function runOut(hole = LANE, b: Ball, maxSteps = 10000): { event: string; steps: number } {
  for (let i = 1; i <= maxSteps; i++) {
    const event = step(hole, b, i * STEP);
    if (event !== 'roll') return { event, steps: i };
  }
  return { event: 'roll', steps: maxSteps };
}

describe('shots', () => {
  it('launch between the weakest and strongest speeds, clamping power', () => {
    expect(shotVelocity(0, 0).vx).toBeCloseTo(MIN_SHOT);
    expect(shotVelocity(0, 1).vx).toBeCloseTo(MAX_SHOT);
    expect(shotVelocity(0, 5).vx).toBeCloseTo(MAX_SHOT);
    expect(shotVelocity(0, -1).vx).toBeCloseTo(MIN_SHOT);
    const down = shotVelocity(Math.PI / 2, 1);
    expect(down.vx).toBeCloseTo(0);
    expect(down.vy).toBeCloseTo(MAX_SHOT);
  });

  it('charge rises to full power, falls back, and repeats', () => {
    expect(chargePower(0)).toBe(0);
    expect(chargePower(CHARGE_SECONDS / 2)).toBeCloseTo(0.5);
    expect(chargePower(CHARGE_SECONDS)).toBeCloseTo(1);
    expect(chargePower(CHARGE_SECONDS * 1.5)).toBeCloseTo(0.5);
    expect(chargePower(CHARGE_SECONDS * 2)).toBeCloseTo(0);
    expect(chargePower(CHARGE_SECONDS * 2.25)).toBeCloseTo(0.25);
    expect(chargePower(-1)).toBe(0);
  });

  it('a drag pulls back: the shot flies the other way, harder the further it is pulled', () => {
    const left = dragShot(-50, 0, 100);
    expect(left.angle).toBeCloseTo(0);
    expect(left.power).toBeCloseTo(0.5);
    const up = dragShot(0, -300, 100);
    expect(up.angle).toBeCloseTo(Math.PI / 2);
    expect(up.power).toBe(1);
  });
});

describe('rolling', () => {
  it('slows down on the green and comes to rest, in a straight line', () => {
    const b = ball(LANE.tee.x, LANE.tee.y, 300, 0);
    const { event } = runOut(LANE, b);
    expect(event).toBe('rest');
    expect(b.vx).toBe(0);
    expect(b.y).toBeCloseTo(LANE.tee.y);
    expect(b.x).toBeGreaterThan(LANE.tee.x + 100);
  });

  it('stops much sooner in sand', () => {
    const sandy = parseHole({ name: 'SAND', par: 2, rows: ['', '####################', '#Tsssssssssssssssss#', '#.................O#', '####################'] });
    const onGreen = simulateShot(LANE, LANE.tee.x, LANE.tee.y, 0, 0.3);
    const inSand = simulateShot(sandy, sandy.tee.x, sandy.tee.y, 0, 0.3);
    expect(onGreen.event).toBe('rest');
    expect(inSand.event).toBe('rest');
    expect(inSand.x - sandy.tee.x).toBeLessThan((onGreen.x - LANE.tee.x) / 2);
  });

  it('is the same every time: a shot is fully determined by where, which way and how hard', () => {
    const hole = parseHole(HOLES[1]);
    const a = simulateShot(hole, hole.tee.x, hole.tee.y, 0.4, 0.9);
    const b = simulateShot(hole, hole.tee.x, hole.tee.y, 0.4, 0.9);
    expect(a).toEqual(b);
  });
});

describe('walls', () => {
  it('bounce the ball back with some speed lost, and keep it out', () => {
    // Heading up into the lane's top wall from just below it.
    const b = ball(5 * CELL, 2 * CELL + BALL_RADIUS + 2, 0, -400);
    let hit = 0;
    for (let i = 0; i < 10; i++) {
      step(LANE, b, i * STEP);
      hit = Math.max(hit, b.hit);
    }
    expect(b.vy).toBeGreaterThan(0);
    expect(b.vy).toBeLessThan(400 * WALL_BOUNCE);
    expect(hit).toBeGreaterThan(300);
    expect(b.y - BALL_RADIUS).toBeGreaterThanOrEqual(2 * CELL - 0.001);
  });

  it.each(HOLES.map((h) => [h.name, h] as const))('never let a full-power shot through on %s, in any direction', (_name, def) => {
    const hole = parseHole(def);
    for (let a = 0; a < 48; a++) {
      const shot = simulateShot(hole, hole.tee.x, hole.tee.y, (a / 48) * Math.PI * 2, 1);
      const ch = tileAt(hole, shot.x, shot.y);
      expect(ch === ' ' || ch === '#', `${def.name} angle ${a}: ended in a wall`).toBe(false);
    }
  });
});

describe('the cup', () => {
  it('takes a slow ball that rolls over it', () => {
    const b = ball(LANE.cup.x - 60, LANE.cup.y, 200, 0);
    expect(runOut(LANE, b).event).toBe('sunk');
  });

  it('lets a fast ball roll over, and draws in one that stops on the lip', () => {
    const passing = ball(LANE.cup.x - 20, LANE.cup.y, CUP_SPEED + 200, 0);
    expect(step(LANE, passing, 0)).toBe('roll');
    const lip = ball(LANE.cup.x - 15, LANE.cup.y, 0, 0);
    expect(runOut(LANE, lip, 200).event).toBe('sunk');
  });
});

describe('water and boost pads', () => {
  const pond = parseHole({ name: 'POND', par: 2, rows: ['', '####################', '#T......www.......O#', '#.....>>>..........#', '####################'] });

  it('water ends the shot', () => {
    expect(simulateShot(pond, pond.tee.x, pond.tee.y, 0, 1).event).toBe('water');
  });

  it('a boost pad speeds the ball along its arrow and never lets it rest on the pad', () => {
    const b = ball(6 * CELL + 5, 3 * CELL + CELL / 2, 0, 0);
    expect(tileOf(pond.grid, 6, 3)).toBe('>');
    expect(step(pond, b, 0)).toBe('roll');
    for (let i = 0; i < 60; i++) step(pond, b, i * STEP);
    expect(b.vx).toBeGreaterThan(200);
    expect(b.x).toBeGreaterThan(9 * CELL);
  });
});

describe('blockers', () => {
  const m: MoverDef = { x: 100, y: 80, w: 20, h: 40, dx: 0, dy: 60, period: 2 };

  it('slide out and back once per period, easing at the ends', () => {
    expect(moverRect(m, 0)).toEqual({ x: 100, y: 80, w: 20, h: 40 });
    expect(moverRect(m, 1).y).toBeCloseTo(140);
    expect(moverRect(m, 2).y).toBeCloseTo(80);
    expect(moverVelocity(m, 0).y).toBeCloseTo(0);
    expect(moverVelocity(m, 0.5).y).toBeGreaterThan(0);
    expect(moverVelocity(m, 1.5).y).toBeLessThan(0);
    expect(moverRect({ ...m, phase: 0.5 }, 0).y).toBeCloseTo(140);
  });

  it('knock a resting ball out of the way', () => {
    const hole = parseHole({
      name: 'BAR',
      par: 2,
      rows: ['', '####################', '#T.................#', '#..................#', '#..................#', '#.................O#', '####################'],
      movers: [{ x: 4 * CELL, y: 2 * CELL, w: 16, h: 30, dx: 0, dy: 100, period: 2 }],
    });
    // Resting just below the bar, in its path.
    const b = ball(4 * CELL + 8, 2 * CELL + 30 + 20);
    let moved = false;
    for (let i = 0; i < 120 && !moved; i++) {
      step(hole, b, i * STEP);
      moved = b.vy > 0;
    }
    expect(moved).toBe(true);
  });
});
