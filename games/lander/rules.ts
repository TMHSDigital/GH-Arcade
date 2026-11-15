import {
  CEILING,
  EDGE,
  FUEL_BURN,
  GROUND_BOTTOM,
  GROUND_TOP,
  PAD_TOP,
  POINTS_BASE,
  POINTS_PAD,
  POINTS_PER_FUEL,
  POINTS_PER_STAGE,
  POINTS_SOFT,
  SAFE_TILT,
  SAFE_VX,
  SAFE_VY,
  SEGMENT,
  SOFT_VY,
  SPAWN_Y,
  THRUST,
  TURN_SPEED,
  WIDTH,
} from './config';

/**
 * Pure Neon Lander rules: stage difficulty, terrain, the flight physics step, the touchdown check
 * and scoring. No Phaser here, so the rules can be tested; the scene owns input, timing, drawing
 * and sound. Screen coordinates: y grows downwards. An angle of 0 is upright and a positive angle
 * leans the nose to the right (clockwise on screen).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Lander {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
}

/** The flat landing pad: its left and right ends and its height. */
export interface Pad {
  x1: number;
  x2: number;
  y: number;
}

/** How hard a stage is. */
export interface StageRules {
  /** Downward pull in pixels per second squared. */
  gravity: number;
  padWidth: number;
  /** Fuel in the tank at the start of each attempt. */
  fuel: number;
  /** Largest sideways push from wind, in pixels per second squared (0 for a calm stage). */
  windMax: number;
  /** Largest change of terrain slope from one point to the next, in pixels. */
  roughness: number;
  /** Sideways drift the lander starts with, in pixels per second. */
  drift: number;
}

/** A stage ready to fly: its rules, with the terrain, the pad, the wind and where the lander starts. */
export interface Stage extends StageRules {
  stage: number;
  /** Signed sideways wind, in pixels per second squared: positive blows to the right. */
  wind: number;
  /** The ground line from x = 0 to x = WIDTH, sorted by x. */
  ground: Point[];
  pad: Pad;
  spawn: Lander;
}

export interface FlightInput {
  /** -1 turns left (anticlockwise), 1 turns right, anything between is analog. */
  turn: number;
  thrust: boolean;
}

export type CrashReason = 'TOO FAST' | 'TOO STEEP' | 'DRIFTING' | 'MISSED THE PAD' | 'HULL BREACH';

export type Outcome = { kind: 'flying' } | { kind: 'landed' } | { kind: 'crashed'; reason: CrashReason };

/** The two landing feet, relative to the lander's centre when upright. */
export const FEET: readonly Point[] = [
  { x: -12, y: 12 },
  { x: 12, y: 12 },
];

/** Points around the hull that must never touch the ground. */
export const HULL: readonly Point[] = [
  { x: 0, y: -14 },
  { x: -10, y: -5 },
  { x: 10, y: -5 },
  { x: -8, y: 6 },
  { x: 8, y: 6 },
];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** An angle folded into -PI..PI, so a lander that spun a full turn counts as upright again. */
export function normalizeAngle(a: number): number {
  // Angles already in range come back untouched, so a limit like SAFE_TILT compares exactly.
  if (a >= -Math.PI && a <= Math.PI) return a;
  const turn = Math.PI * 2;
  const r = (((a + Math.PI) % turn) + turn) % turn;
  return r - Math.PI;
}

/** The difficulty of a stage (1 and up): stronger gravity, narrower pads, rougher ground, then wind. */
export function stageRules(stage: number): StageRules {
  const s = Math.max(1, Math.floor(stage)) - 1;
  return {
    gravity: Math.min(28 + s * 4, 50),
    padWidth: Math.max(120 - s * 12, 44),
    fuel: Math.max(100 - s * 4, 70),
    windMax: s >= 2 ? Math.min((s - 1) * 4, 18) : 0,
    roughness: Math.min(18 + s * 4, 44),
    drift: Math.min(16 + s * 6, 45),
  };
}

/**
 * Builds a stage: a rough ground line with one flat pad, the wind, and a spawn point high up on
 * the side away from the pad. `rand` is a Math.random stand-in, so a seeded one gives the same stage.
 */
export function buildStage(stage: number, rand: () => number = Math.random): Stage {
  const rules = stageRules(stage);
  const padWidth = rules.padWidth;
  const padX = Math.round(EDGE * 3 + rand() * (WIDTH - padWidth - EDGE * 6));

  // A random walk on the slope gives ridges and valleys rather than noise.
  const count = Math.round(WIDTH / SEGMENT);
  const heights: number[] = [];
  let y = GROUND_TOP + 80 + rand() * (GROUND_BOTTOM - GROUND_TOP - 120);
  let slope = 0;
  for (let i = 0; i <= count; i++) {
    heights.push(y);
    slope = clamp(slope + (rand() * 2 - 1) * rules.roughness * 0.7, -rules.roughness, rules.roughness);
    y += slope;
    if (y < GROUND_TOP || y > GROUND_BOTTOM) {
      y = clamp(y, GROUND_TOP, GROUND_BOTTOM);
      slope = -slope * 0.5;
    }
  }

  const padY = Math.round(clamp(heights[Math.round((padX + padWidth / 2) / SEGMENT)], PAD_TOP, GROUND_BOTTOM - 12));
  const ground: Point[] = [];
  for (let i = 0; i <= count; i++) {
    const x = i * SEGMENT;
    if (x >= padX && x <= padX + padWidth) continue;
    // Ease the ground next to the pad towards it, so its edges are not sheer walls.
    const gap = x < padX ? padX - x : x - padX - padWidth;
    const ease = gap < SEGMENT * 2 ? 0.5 : 0;
    ground.push({ x, y: Math.round(heights[i] + (padY - heights[i]) * ease) });
  }
  ground.push({ x: padX, y: padY }, { x: padX + padWidth, y: padY });
  ground.sort((a, b) => a.x - b.x);

  const padCentre = padX + padWidth / 2;
  const fromLeft = padCentre > WIDTH / 2;
  const windSign = rand() < 0.5 ? -1 : 1;
  const wind = rules.windMax ? windSign * Math.round(rules.windMax * (0.5 + rand() * 0.5)) : 0;

  return {
    ...rules,
    stage,
    wind,
    ground,
    pad: { x1: padX, x2: padX + padWidth, y: padY },
    spawn: { x: fromLeft ? 110 : WIDTH - 110, y: SPAWN_Y, vx: (fromLeft ? 1 : -1) * rules.drift, vy: 0, angle: 0 },
  };
}

/** The height of the ground at x, interpolated along the line. Off either end it stays level. */
export function groundYAt(ground: readonly Point[], x: number): number {
  if (x <= ground[0].x) return ground[0].y;
  for (let i = 1; i < ground.length; i++) {
    const b = ground[i];
    if (x <= b.x) {
      const a = ground[i - 1];
      return b.x === a.x ? b.y : a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
    }
  }
  return ground[ground.length - 1].y;
}

/** A point on the lander (relative to its upright centre) in screen coordinates. */
export function toWorld(l: Lander, p: Point): Point {
  const c = Math.cos(l.angle);
  const s = Math.sin(l.angle);
  return { x: l.x + p.x * c - p.y * s, y: l.y + p.x * s + p.y * c };
}

/**
 * Advances the lander by dt seconds: turning, gravity, wind and the main engine, which burns fuel
 * and stops when the tank runs dry partway through the step. The lander stays between the side
 * walls and below the ceiling.
 */
export function stepLander(
  l: Lander,
  input: FlightInput,
  env: { gravity: number; wind: number },
  fuel: number,
  dt: number,
): { lander: Lander; fuel: number; thrusting: boolean } {
  const angle = normalizeAngle(l.angle + clamp(input.turn, -1, 1) * TURN_SPEED * dt);
  const burn = input.thrust && dt > 0 ? Math.min(Math.max(fuel, 0), FUEL_BURN * dt) : 0;
  const power = burn > 0 ? burn / (FUEL_BURN * dt) : 0;
  let vx = l.vx + (env.wind + power * THRUST * Math.sin(angle)) * dt;
  let vy = l.vy + (env.gravity - power * THRUST * Math.cos(angle)) * dt;
  let x = l.x + vx * dt;
  let y = l.y + vy * dt;
  if (x < EDGE || x > WIDTH - EDGE) {
    x = clamp(x, EDGE, WIDTH - EDGE);
    vx = 0;
  }
  if (y < CEILING) {
    y = CEILING;
    vy = Math.max(vy, 0);
  }
  return { lander: { x, y, vx, vy, angle }, fuel: fuel - burn, thrusting: burn > 0 };
}

/** Which of the touchdown limits the lander is inside right now, and whether all of them are. */
export function landingChecks(l: Lander): { vx: boolean; vy: boolean; tilt: boolean; safe: boolean } {
  const vx = Math.abs(l.vx) <= SAFE_VX;
  const vy = l.vy <= SAFE_VY;
  const tilt = Math.abs(normalizeAngle(l.angle)) <= SAFE_TILT;
  return { vx, vy, tilt, safe: vx && vy && tilt };
}

/**
 * Whether the lander has touched the ground, and how it went: a landing needs both feet on the
 * pad, near upright and slow; any other contact is a crash, and the hull touching first always is.
 */
export function touchdown(l: Lander, ground: readonly Point[], pad: Pad): Outcome {
  const feet = FEET.map((p) => toWorld(l, p));
  const footDown = feet.some((f) => f.y >= groundYAt(ground, f.x));
  if (!footDown) {
    const hullDown = HULL.some((p) => {
      const w = toWorld(l, p);
      return w.y >= groundYAt(ground, w.x);
    });
    return hullDown ? { kind: 'crashed', reason: 'HULL BREACH' } : { kind: 'flying' };
  }
  if (!feet.every((f) => f.x >= pad.x1 && f.x <= pad.x2)) return { kind: 'crashed', reason: 'MISSED THE PAD' };
  const checks = landingChecks(l);
  if (!checks.vy) return { kind: 'crashed', reason: 'TOO FAST' };
  if (!checks.tilt) return { kind: 'crashed', reason: 'TOO STEEP' };
  if (!checks.vx) return { kind: 'crashed', reason: 'DRIFTING' };
  return { kind: 'landed' };
}

/** The lander settled on the pad: upright, still, with its feet on the pad's surface. */
export function restOnPad(l: Lander, pad: Pad): Lander {
  const foot = FEET[0].y;
  return { x: l.x, y: pad.y - foot, vx: 0, vy: 0, angle: 0 };
}

/** The height of the lander's feet above the ground under it, in pixels (never below 0). */
export function altitude(l: Lander, ground: readonly Point[]): number {
  const lowest = Math.max(...FEET.map((p) => toWorld(l, p).y));
  return Math.max(0, groundYAt(ground, l.x) - lowest);
}

export interface LandingScore {
  base: number;
  pad: number;
  fuel: number;
  soft: number;
  total: number;
}

/** Points for a landing: more on later stages, on narrower pads, with more fuel left and for a soft touch. */
export function landingPoints(stage: number, padWidth: number, fuelLeft: number, vy: number): LandingScore {
  const base = POINTS_BASE + POINTS_PER_STAGE * Math.max(1, stage);
  const pad = Math.round(POINTS_PAD / padWidth);
  const fuel = Math.round(Math.max(0, fuelLeft) * POINTS_PER_FUEL);
  const soft = vy <= SOFT_VY ? POINTS_SOFT : 0;
  return { base, pad, fuel, soft, total: base + pad + fuel + soft };
}
