import { describe, expect, it } from 'vitest';
import { createRng } from '../../shared/rng';
import {
  CEILING,
  EDGE,
  FUEL_BURN,
  GROUND_BOTTOM,
  GROUND_TOP,
  PAD_TOP,
  POINTS_SOFT,
  SAFE_TILT,
  SAFE_VX,
  SAFE_VY,
  SOFT_VY,
  THRUST,
  WIDTH,
} from './config';
import {
  altitude,
  buildStage,
  groundYAt,
  type Lander,
  landingChecks,
  landingPoints,
  normalizeAngle,
  type Pad,
  type Point,
  restOnPad,
  stageRules,
  stepLander,
  toWorld,
  touchdown,
} from './rules';

const calm = { gravity: 30, wind: 0 };
const still: Lander = { x: 400, y: 200, vx: 0, vy: 0, angle: 0 };

/** Flat ground at y = 500 with a pad from 300 to 400. */
const flat: Point[] = [
  { x: 0, y: 500 },
  { x: 300, y: 500 },
  { x: 400, y: 500 },
  { x: WIDTH, y: 500 },
];
const pad: Pad = { x1: 300, x2: 400, y: 500 };
/** A lander whose feet are just touching the flat ground. */
const touching = (over: Partial<Lander> = {}): Lander => ({ x: 350, y: 489, vx: 0, vy: 20, angle: 0, ...over });

describe('stageRules', () => {
  it('gets harder every stage, within limits', () => {
    for (let s = 1; s < 30; s++) {
      const a = stageRules(s);
      const b = stageRules(s + 1);
      expect(b.gravity).toBeGreaterThanOrEqual(a.gravity);
      expect(b.padWidth).toBeLessThanOrEqual(a.padWidth);
      expect(b.fuel).toBeLessThanOrEqual(a.fuel);
      expect(b.windMax).toBeGreaterThanOrEqual(a.windMax);
    }
    const hardest = stageRules(99);
    // The engine must still beat gravity comfortably, and the pad must still fit both feet.
    expect(THRUST / hardest.gravity).toBeGreaterThan(1.5);
    expect(hardest.padWidth).toBeGreaterThanOrEqual(40);
  });

  it('starts calm and brings in wind from stage 3', () => {
    expect(stageRules(1).windMax).toBe(0);
    expect(stageRules(2).windMax).toBe(0);
    expect(stageRules(3).windMax).toBeGreaterThan(0);
  });
});

describe('buildStage', () => {
  const stages = Array.from({ length: 60 }, (_, i) => buildStage((i % 12) + 1, createRng(`stage-${i}`).next));

  it('covers the screen with a sorted ground line inside the bounds', () => {
    for (const st of stages) {
      expect(st.ground[0].x).toBe(0);
      expect(st.ground[st.ground.length - 1].x).toBe(WIDTH);
      for (let i = 1; i < st.ground.length; i++) expect(st.ground[i].x).toBeGreaterThan(st.ground[i - 1].x);
      for (const p of st.ground) {
        expect(p.y).toBeGreaterThanOrEqual(GROUND_TOP);
        expect(p.y).toBeLessThanOrEqual(GROUND_BOTTOM);
      }
    }
  });

  it('places a flat pad of the stage width, low enough to line up above', () => {
    for (const st of stages) {
      expect(st.pad.x2 - st.pad.x1).toBe(st.padWidth);
      expect(st.pad.x1).toBeGreaterThanOrEqual(EDGE);
      expect(st.pad.x2).toBeLessThanOrEqual(WIDTH - EDGE);
      expect(st.pad.y).toBeGreaterThanOrEqual(PAD_TOP);
      for (let x = st.pad.x1; x <= st.pad.x2; x += 4) expect(groundYAt(st.ground, x)).toBeCloseTo(st.pad.y);
    }
  });

  it('starts the lander high up on the far side, drifting towards the pad', () => {
    for (const st of stages) {
      const padCentre = (st.pad.x1 + st.pad.x2) / 2;
      expect(Math.sign(padCentre - st.spawn.x)).toBe(Math.sign(st.spawn.vx));
      expect(altitude(st.spawn, st.ground)).toBeGreaterThan(200);
      expect(st.spawn.angle).toBe(0);
    }
  });

  it('only blows wind on stages that have it, never above the limit', () => {
    for (const st of stages) {
      expect(Math.abs(st.wind)).toBeLessThanOrEqual(st.windMax);
      if (st.windMax === 0) expect(st.wind).toBe(0);
    }
  });

  it('builds the same stage from the same seed', () => {
    expect(buildStage(4, createRng('daily').next)).toEqual(buildStage(4, createRng('daily').next));
  });
});

describe('groundYAt', () => {
  const line: Point[] = [
    { x: 0, y: 400 },
    { x: 100, y: 500 },
    { x: 200, y: 500 },
  ];

  it('interpolates between points and stays level past the ends', () => {
    expect(groundYAt(line, 50)).toBe(450);
    expect(groundYAt(line, 150)).toBe(500);
    expect(groundYAt(line, -10)).toBe(400);
    expect(groundYAt(line, 999)).toBe(500);
  });
});

describe('normalizeAngle and toWorld', () => {
  it('folds angles into -PI..PI', () => {
    expect(normalizeAngle(Math.PI * 2 + 0.1)).toBeCloseTo(0.1);
    expect(normalizeAngle(-Math.PI * 2 - 0.1)).toBeCloseTo(-0.1);
    expect(normalizeAngle(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
  });

  it('turns the nose to the right for a positive angle', () => {
    const nose = toWorld({ ...still, angle: Math.PI / 2 }, { x: 0, y: -10 });
    expect(nose.x).toBeCloseTo(410);
    expect(nose.y).toBeCloseTo(200);
  });
});

describe('stepLander', () => {
  it('falls under gravity without thrust and keeps its fuel', () => {
    const { lander, fuel, thrusting } = stepLander(still, { turn: 0, thrust: false }, calm, 50, 0.5);
    expect(lander.vy).toBeCloseTo(15);
    expect(lander.y).toBeGreaterThan(still.y);
    expect(fuel).toBe(50);
    expect(thrusting).toBe(false);
  });

  it('climbs on full thrust when upright and burns fuel', () => {
    const { lander, fuel, thrusting } = stepLander(still, { turn: 0, thrust: true }, calm, 50, 0.5);
    expect(lander.vy).toBeCloseTo((30 - THRUST) * 0.5);
    expect(fuel).toBeCloseTo(50 - FUEL_BURN * 0.5);
    expect(thrusting).toBe(true);
  });

  it('pushes sideways when tilted', () => {
    const right = stepLander({ ...still, angle: 0.5 }, { turn: 0, thrust: true }, calm, 50, 0.1).lander;
    const left = stepLander({ ...still, angle: -0.5 }, { turn: 0, thrust: true }, calm, 50, 0.1).lander;
    expect(right.vx).toBeGreaterThan(0);
    expect(left.vx).toBeLessThan(0);
  });

  it('gives no thrust on an empty tank, and only part of it on the last drops', () => {
    const empty = stepLander(still, { turn: 0, thrust: true }, calm, 0, 0.5);
    expect(empty.thrusting).toBe(false);
    expect(empty.lander.vy).toBeCloseTo(15);
    const last = stepLander(still, { turn: 0, thrust: true }, calm, FUEL_BURN * 0.25, 0.5);
    expect(last.fuel).toBe(0);
    expect(last.lander.vy).toBeCloseTo((30 - THRUST * 0.5) * 0.5);
  });

  it('turns at the input rate', () => {
    const l = stepLander(still, { turn: 1, thrust: false }, calm, 0, 0.1).lander;
    const r = stepLander(still, { turn: -0.5, thrust: false }, calm, 0, 0.1).lander;
    expect(l.angle).toBeGreaterThan(0);
    expect(r.angle).toBeLessThan(0);
    expect(Math.abs(r.angle)).toBeCloseTo(l.angle / 2);
  });

  it('drifts with the wind', () => {
    const { lander } = stepLander(still, { turn: 0, thrust: false }, { gravity: 30, wind: -10 }, 0, 1);
    expect(lander.vx).toBeCloseTo(-10);
  });

  it('stops at the side walls and the ceiling', () => {
    const wall = stepLander({ ...still, x: EDGE + 1, vx: -200 }, { turn: 0, thrust: false }, calm, 0, 0.1).lander;
    expect(wall.x).toBe(EDGE);
    expect(wall.vx).toBe(0);
    const top = stepLander({ ...still, y: CEILING + 1, vy: -200 }, { turn: 0, thrust: false }, calm, 0, 0.1).lander;
    expect(top.y).toBe(CEILING);
    expect(top.vy).toBeGreaterThanOrEqual(0);
  });
});

describe('landingChecks', () => {
  it('passes inside every limit and names the one that fails', () => {
    expect(landingChecks({ ...still, vx: SAFE_VX, vy: SAFE_VY, angle: SAFE_TILT }).safe).toBe(true);
    expect(landingChecks({ ...still, vy: SAFE_VY + 1 })).toMatchObject({ vy: false, safe: false });
    expect(landingChecks({ ...still, vx: -SAFE_VX - 1 })).toMatchObject({ vx: false, safe: false });
    expect(landingChecks({ ...still, angle: -SAFE_TILT - 0.01 })).toMatchObject({ tilt: false, safe: false });
    // Climbing away is never too fast to land.
    expect(landingChecks({ ...still, vy: -200 }).vy).toBe(true);
  });
});

describe('touchdown', () => {
  it('keeps flying until something touches the ground', () => {
    expect(touchdown(touching({ y: 480 }), flat, pad)).toEqual({ kind: 'flying' });
  });

  it('lands slow, upright and with both feet on the pad', () => {
    expect(touchdown(touching(), flat, pad)).toEqual({ kind: 'landed' });
  });

  it('crashes on each broken limit', () => {
    expect(touchdown(touching({ vy: SAFE_VY + 5 }), flat, pad)).toEqual({ kind: 'crashed', reason: 'TOO FAST' });
    expect(touchdown(touching({ angle: SAFE_TILT + 0.1 }), flat, pad)).toEqual({ kind: 'crashed', reason: 'TOO STEEP' });
    expect(touchdown(touching({ vx: SAFE_VX + 5 }), flat, pad)).toEqual({ kind: 'crashed', reason: 'DRIFTING' });
  });

  it('crashes when a foot is off the pad', () => {
    expect(touchdown(touching({ x: 395 }), flat, pad)).toEqual({ kind: 'crashed', reason: 'MISSED THE PAD' });
    expect(touchdown(touching({ x: 150 }), flat, pad)).toEqual({ kind: 'crashed', reason: 'MISSED THE PAD' });
  });

  it('crashes when the hull meets the ground first', () => {
    // Upside down: the nose points at the ground and the feet are in the air.
    const flipped = { x: 350, y: 487, vx: 0, vy: 10, angle: Math.PI };
    expect(touchdown(flipped, flat, pad)).toEqual({ kind: 'crashed', reason: 'HULL BREACH' });
  });
});

describe('restOnPad and altitude', () => {
  it('stands the lander on the pad with its feet on the surface', () => {
    const rest = restOnPad(touching({ y: 492, angle: 0.1, vx: 5 }), pad);
    expect(rest).toMatchObject({ vx: 0, vy: 0, angle: 0 });
    expect(altitude(rest, flat)).toBe(0);
    expect(touchdown(rest, flat, pad)).toEqual({ kind: 'landed' });
  });

  it('measures from the feet to the ground', () => {
    expect(altitude({ ...still, y: 388 }, flat)).toBe(100);
  });
});

describe('landingPoints', () => {
  it('pays more for later stages, narrower pads, leftover fuel and a soft touch', () => {
    const plain = landingPoints(1, 120, 0, SAFE_VY);
    expect(plain.total).toBe(plain.base + plain.pad);
    expect(landingPoints(3, 120, 0, SAFE_VY).total).toBeGreaterThan(plain.total);
    expect(landingPoints(1, 60, 0, SAFE_VY).pad).toBeGreaterThan(plain.pad);
    expect(landingPoints(1, 120, 40, SAFE_VY).fuel).toBeGreaterThan(0);
    expect(landingPoints(1, 120, 0, SOFT_VY).soft).toBe(POINTS_SOFT);
    const all = landingPoints(5, 50, 33.4, 3);
    expect(all.total).toBe(all.base + all.pad + all.fuel + all.soft);
  });

  it('never pays for negative fuel', () => {
    expect(landingPoints(1, 120, -5, SAFE_VY).fuel).toBe(0);
  });
});
