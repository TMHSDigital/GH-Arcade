import { describe, expect, it } from 'vitest';
import {
  BALL_SIZE,
  BOTTOM,
  CPU_ERROR,
  CPU_REACT,
  CPU_SPEED,
  MAX_ANGLE,
  MAX_SPEED,
  PADDLE_H,
  PADDLE_W,
  PADDLE_X,
  POINTS_TO_WIN,
  SERVE_SPEED,
  SPEEDUP,
  SPIN,
  TOP,
  WIDTH,
} from './config';
import { type Ball, bounceOffPaddle, cpuAimError, cpuMove, matchScore, type PaddleCore, predictY, touchesPaddle } from './rules';

const MID = (TOP + BOTTOM) / 2;
const LOW = TOP + BALL_SIZE / 2;
const HIGH = BOTTOM - BALL_SIZE / 2;

const ball = (over: Partial<Ball> = {}): Ball => ({ x: WIDTH / 2, y: MID, vx: SERVE_SPEED, vy: 0, speed: SERVE_SPEED, ...over });
const right = (over: Partial<PaddleCore> = {}): PaddleCore => ({ side: 1, x: WIDTH - PADDLE_X, y: MID, vy: 0, aimError: 0, ...over });
const left = (over: Partial<PaddleCore> = {}): PaddleCore => ({ side: -1, x: PADDLE_X, y: MID, vy: 0, aimError: 0, ...over });

describe('predictY', () => {
  it('is the current height for a ball flying level, or one that is not moving sideways', () => {
    expect(predictY(ball(), WIDTH - PADDLE_X)).toBeCloseTo(MID);
    expect(predictY(ball({ vx: 0, y: 200 }), WIDTH - PADDLE_X)).toBe(200);
  });

  it('follows a straight line when no wall is in the way', () => {
    const b = ball({ vx: 400, vy: 100 });
    // One second to cover 400 px, so the ball rises 100 px.
    expect(predictY(b, b.x + 400)).toBeCloseTo(MID + 100);
  });

  it('reflects off a wall and always lands inside the playfield', () => {
    const b = ball({ y: HIGH - 10, vx: 400, vy: 200 });
    // It reaches the bottom wall after 10 px of travel and comes back up for the other 190.
    expect(predictY(b, b.x + 400)).toBeCloseTo(HIGH - 190);
    for (const vy of [-3000, -900, 900, 3000]) {
      const y = predictY(ball({ vx: 300, vy }), WIDTH - PADDLE_X);
      expect(y).toBeGreaterThanOrEqual(LOW);
      expect(y).toBeLessThanOrEqual(HIGH);
    }
  });
});

describe('cpuMove', () => {
  const inItsHalf = WIDTH * CPU_REACT + 50;

  it('heads for where the ball will arrive, no faster than its top speed', () => {
    const b = ball({ x: inItsHalf, vx: 400, vy: 300 });
    const p = right({ y: MID });
    const target = predictY(b, p.x);
    const next = cpuMove(p, b, true, 0.016);
    expect(Math.sign(next - p.y)).toBe(Math.sign(target - p.y));
    expect(Math.abs(next - p.y)).toBeCloseTo(CPU_SPEED * 0.016);
  });

  it('aims off by its current error', () => {
    const b = ball({ x: inItsHalf, vx: 400, vy: 0, y: MID });
    // Dead level ball: a paddle with no error is already there, one with an error moves toward it.
    expect(cpuMove(right({ y: MID }), b, true, 0.016)).toBe(MID);
    expect(cpuMove(right({ y: MID, aimError: 30 }), b, true, 0.016)).toBeGreaterThan(MID);
  });

  it('ignores a ball that is going away, not live, or still in the other half', () => {
    const away = ball({ x: inItsHalf, vx: -400, vy: 300 });
    const far = ball({ x: WIDTH * CPU_REACT - 50, vx: 400, vy: 300 });
    const coming = ball({ x: inItsHalf, vx: 400, vy: 300 });
    const p = right({ y: MID });
    expect(cpuMove(p, away, true, 0.016)).toBe(MID);
    expect(cpuMove(p, far, true, 0.016)).toBe(MID);
    expect(cpuMove(p, coming, false, 0.016)).toBe(MID);
  });

  it('drifts back to the middle when it has nothing to chase', () => {
    const p = right({ y: MID + 100 });
    expect(cpuMove(p, ball({ vx: -400 }), true, 0.016)).toBeLessThan(p.y);
  });

  it('holds still when it is within a few pixels of its target', () => {
    expect(cpuMove(right({ y: MID + 4 }), ball({ vx: -400 }), true, 0.016)).toBe(MID + 4);
  });

  it('works for a paddle on the left too', () => {
    const b = ball({ x: WIDTH * (1 - CPU_REACT) - 50, vx: -400, vy: -300 });
    const p = left({ y: MID });
    expect(Math.sign(cpuMove(p, b, true, 0.016) - p.y)).toBe(Math.sign(predictY(b, p.x) - p.y));
  });
});

describe('cpuAimError', () => {
  it('scales with the roll and with ball speed, up to a limit', () => {
    expect(cpuAimError(SERVE_SPEED, 1)).toBeCloseTo(CPU_ERROR);
    expect(cpuAimError(SERVE_SPEED, -0.5)).toBeCloseTo(-CPU_ERROR / 2);
    expect(cpuAimError(SERVE_SPEED * 1.5, 1)).toBeCloseTo(CPU_ERROR * 1.5);
    expect(cpuAimError(SERVE_SPEED * 10, 1)).toBeCloseTo(CPU_ERROR * 1.8);
  });
});

describe('touchesPaddle', () => {
  const p = right();
  const face = p.x - PADDLE_W / 2;

  it('is true when an incoming ball reaches the face within the paddle height', () => {
    expect(touchesPaddle(ball({ x: face - BALL_SIZE / 2 + 1, vx: 400 }), p)).toBe(true);
    expect(touchesPaddle(ball({ x: face - BALL_SIZE / 2 + 1, vx: 400, y: p.y + PADDLE_H / 2 + BALL_SIZE / 2 }), p)).toBe(true);
  });

  it('is false before the ball gets there, or above and below the paddle', () => {
    expect(touchesPaddle(ball({ x: face - 40, vx: 400 }), p)).toBe(false);
    expect(touchesPaddle(ball({ x: face - BALL_SIZE / 2 + 1, vx: 400, y: p.y + PADDLE_H / 2 + BALL_SIZE / 2 + 1 }), p)).toBe(false);
  });

  it('is false for a ball moving away, so one hit never counts twice', () => {
    expect(touchesPaddle(ball({ x: face - BALL_SIZE / 2 + 1, vx: -400 }), p)).toBe(false);
  });

  it('is false once the ball is already past the paddle', () => {
    expect(touchesPaddle(ball({ x: p.x + PADDLE_W + 1, vx: 400 }), p)).toBe(false);
  });

  it('mirrors for the left paddle', () => {
    const l = left();
    expect(touchesPaddle(ball({ x: l.x + PADDLE_W / 2 + BALL_SIZE / 2 - 1, vx: -400 }), l)).toBe(true);
    expect(touchesPaddle(ball({ x: l.x - PADDLE_W - 1, vx: -400 }), l)).toBe(false);
  });
});

describe('bounceOffPaddle', () => {
  it('sends a centered hit straight back, a little faster, clear of the paddle', () => {
    const p = right();
    const b = ball({ x: p.x, y: p.y, vx: 380 });
    bounceOffPaddle(b, p);
    expect(b.speed).toBeCloseTo(SERVE_SPEED * SPEEDUP);
    expect(b.vx).toBeCloseTo(-b.speed);
    expect(b.vy).toBeCloseTo(0);
    expect(b.x).toBeLessThan(p.x - PADDLE_W / 2);
    expect(touchesPaddle(b, p)).toBe(false);
  });

  it('angles the ball by where it hits, up to the steepest angle at the edge', () => {
    const p = right();
    const edge = ball({ y: p.y + PADDLE_H / 2 });
    bounceOffPaddle(edge, p);
    expect(Math.atan2(edge.vy, -edge.vx)).toBeCloseTo(MAX_ANGLE);
    const beyond = ball({ y: p.y - PADDLE_H });
    bounceOffPaddle(beyond, p);
    expect(Math.atan2(beyond.vy, -beyond.vx)).toBeCloseTo(-MAX_ANGLE);
  });

  it('adds spin from a moving paddle', () => {
    const b = ball({ y: MID });
    bounceOffPaddle(b, right({ vy: 200 }));
    expect(b.vy).toBeCloseTo(200 * SPIN);
  });

  it('never speeds the ball past the cap', () => {
    const b = ball({ speed: MAX_SPEED });
    bounceOffPaddle(b, right());
    expect(b.speed).toBe(MAX_SPEED);
  });

  it('sends the ball right off the left paddle', () => {
    const b = ball({ vx: -380 });
    bounceOffPaddle(b, left());
    expect(b.vx).toBeGreaterThan(0);
  });
});

describe('matchScore', () => {
  it('gives 100 per goal for a loss', () => {
    expect(matchScore(3, POINTS_TO_WIN, false)).toBe(300);
    expect(matchScore(0, POINTS_TO_WIN, false)).toBe(0);
  });

  it('adds a win bonus that grows with the margin', () => {
    expect(matchScore(POINTS_TO_WIN, 0, true)).toBe(POINTS_TO_WIN * 100 + 500 + POINTS_TO_WIN * 100);
    expect(matchScore(POINTS_TO_WIN, POINTS_TO_WIN - 1, true)).toBe(POINTS_TO_WIN * 100 + 600);
    expect(matchScore(POINTS_TO_WIN, 0, true)).toBeGreaterThan(matchScore(POINTS_TO_WIN, 3, true));
  });
});
