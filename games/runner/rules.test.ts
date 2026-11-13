import { describe, expect, it } from 'vitest';
import { COIN_POINTS, GROUND_Y, LEDGE_FORGIVENESS, PLAYER_H, PLAYER_W, PX_PER_METRE, SLIDE_H } from './config';
import {
  DRONE_BOTTOM,
  DRONE_H,
  droneOverhead,
  gapUnder,
  hitsGapWall,
  hitsObstacle,
  landsOnGround,
  metresRun,
  playerBox,
  runScore,
  touchesCoin,
} from './rules';

describe('gaps', () => {
  const gaps = [{ x: 1000, w: 120 }];

  it('is over a gap only when the whole foot span is inside it', () => {
    expect(gapUnder(1060, gaps)).toBe(true);
    // Toes over the near edge, heels still on the floor.
    expect(gapUnder(1000, gaps)).toBe(false);
    // Toes already on the far side.
    expect(gapUnder(1120, gaps)).toBe(false);
    expect(gapUnder(500, gaps)).toBe(false);
  });

  it('never falls through a gap narrower than the feet', () => {
    const narrow = [{ x: 1000, w: PLAYER_W - 14 }];
    for (let x = 980; x <= 1040; x++) expect(gapUnder(x, narrow), `x ${x}`).toBe(false);
  });
});

describe('landing', () => {
  it('lands when falling onto the floor away from a gap', () => {
    expect(landsOnGround(false, GROUND_Y - 5, GROUND_Y + 3, 400)).toBe(true);
    // Standing still counts as resting on the floor.
    expect(landsOnGround(false, GROUND_Y, GROUND_Y, 0)).toBe(true);
  });

  it('does not land while rising, in the air or over a gap', () => {
    expect(landsOnGround(false, GROUND_Y, GROUND_Y, -860)).toBe(false);
    expect(landsOnGround(false, GROUND_Y - 80, GROUND_Y - 60, 300)).toBe(false);
    expect(landsOnGround(true, GROUND_Y - 5, GROUND_Y + 3, 400)).toBe(false);
  });

  it('catches the far edge of a gap only within the ledge forgiveness', () => {
    expect(landsOnGround(false, GROUND_Y + LEDGE_FORGIVENESS, GROUND_Y + LEDGE_FORGIVENESS + 4, 300)).toBe(true);
    expect(landsOnGround(false, GROUND_Y + LEDGE_FORGIVENESS + 1, GROUND_Y + LEDGE_FORGIVENESS + 5, 300)).toBe(false);
  });

  it('hits the far wall when still below the floor as the gap ends', () => {
    expect(hitsGapWall(false, GROUND_Y + LEDGE_FORGIVENESS + 1)).toBe(true);
    expect(hitsGapWall(false, GROUND_Y + LEDGE_FORGIVENESS)).toBe(false);
    // Still falling inside the gap: no wall yet.
    expect(hitsGapWall(true, GROUND_Y + 200)).toBe(false);
  });
});

describe('player box', () => {
  it('is tall and narrow when running, low and long when sliding', () => {
    const run = playerBox(0, GROUND_Y, false);
    const slide = playerBox(0, GROUND_Y, true);
    expect(run.b - run.t).toBeLessThan(PLAYER_H);
    expect(slide.b - slide.t).toBeLessThan(SLIDE_H);
    expect(slide.r - slide.l).toBeGreaterThan(run.r - run.l);
    // Centred on the feet.
    expect(run.l + run.r).toBeCloseTo(0);
    expect(slide.l + slide.r).toBeCloseTo(0);
  });
});

describe('obstacles', () => {
  const block = { x: 1000, w: 40, h: 50 };
  const drone = { x: 1000, w: 90 };

  it('running into a block is a hit, clearing it is not', () => {
    expect(hitsObstacle(playerBox(1010, GROUND_Y, false), [block], [])).toBe(true);
    expect(hitsObstacle(playerBox(1010, GROUND_Y - block.h - 1, false), [block], [])).toBe(false);
    expect(hitsObstacle(playerBox(900, GROUND_Y, false), [block], [])).toBe(false);
  });

  it('sliding does not get under a block', () => {
    expect(hitsObstacle(playerBox(1010, GROUND_Y, true), [block], [])).toBe(true);
  });

  it('a drone stops a standing runner but not a sliding one', () => {
    expect(hitsObstacle(playerBox(1040, GROUND_Y, false), [], [drone])).toBe(true);
    expect(hitsObstacle(playerBox(1040, GROUND_Y, true), [], [drone])).toBe(false);
  });

  it('a drone can be jumped over but not jumped into', () => {
    expect(hitsObstacle(playerBox(1040, DRONE_BOTTOM - DRONE_H - 1, false), [], [drone])).toBe(false);
    expect(hitsObstacle(playerBox(1040, DRONE_BOTTOM - 4, false), [], [drone])).toBe(true);
  });

  it('keeps a sliding runner ducked until the drone has passed', () => {
    expect(droneOverhead(1040, [drone])).toBe(true);
    expect(droneOverhead(1000 - PLAYER_H, [drone])).toBe(false);
    expect(droneOverhead(1090 + PLAYER_H, [drone])).toBe(false);
    // The overhead span covers the whole sliding box, so standing up is always safe once it clears.
    for (let x = 900; x <= 1200; x++) {
      if (!droneOverhead(x, [drone])) expect(hitsObstacle(playerBox(x, GROUND_Y, false), [], [drone]), `x ${x}`).toBe(false);
    }
  });
});

describe('coins', () => {
  it('are picked up on touch only', () => {
    const p = playerBox(1000, GROUND_Y, false);
    expect(touchesCoin(p, { x: 1000, y: GROUND_Y - 20, taken: false })).toBe(true);
    expect(touchesCoin(p, { x: 1000, y: GROUND_Y - PLAYER_H - 30, taken: false })).toBe(false);
    expect(touchesCoin(p, { x: 1060, y: GROUND_Y - 20, taken: false })).toBe(false);
  });

  it('a slide passes under a coin at head height', () => {
    const coin = { x: 1000, y: GROUND_Y - PLAYER_H + 6, taken: false };
    expect(touchesCoin(playerBox(1000, GROUND_Y, false), coin)).toBe(true);
    expect(touchesCoin(playerBox(1000, GROUND_Y, true), coin)).toBe(false);
  });
});

describe('score', () => {
  it('is whole metres run plus points per coin', () => {
    expect(metresRun(PX_PER_METRE * 10 + 5)).toBe(10);
    expect(runScore(PX_PER_METRE * 10 + 5, 0)).toBe(10);
    expect(runScore(PX_PER_METRE * 10, 3)).toBe(10 + 3 * COIN_POINTS);
  });
});
