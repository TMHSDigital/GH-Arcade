import { centerOf, clampAngle, clampPower, type Impact, simulateShot, type TankPos } from './ballistics';
import { BLAST_R, type CpuProfile, MAX_POWER, MIN_POWER, TANK_HIT_R } from './config';
import type { Heights } from './terrain';

export interface Aim {
  angle: number;
  power: number;
}

/** The CPU plans with a coarser step than the game flies at; close enough to choose a shot. */
const PLAN_DT = 1 / 120;
const SELF_PENALTY = 2000;
/** Landing this close to its own tank would hurt the shooter. */
const BLAST_R_SELF = BLAST_R + TANK_HIT_R;
const NO_LANDING = 100000;

/** How far a shot misses `target`, in pixels, with a large penalty for landing close to the shooter. */
function miss(hit: Impact, tanks: readonly TankPos[], shooter: number, target: number): number {
  if (hit.kind === 'tank' && hit.tank === target) return 0;
  if (hit.kind === 'out' || hit.kind === 'timeout') return NO_LANDING + Math.abs(hit.x - tanks[target].x);
  const t = centerOf(tanks[target]);
  const s = centerOf(tanks[shooter]);
  const own = Math.hypot(hit.x - s.x, hit.y - s.y) < BLAST_R_SELF ? SELF_PENALTY : 0;
  return Math.hypot(hit.x - t.x, hit.y - t.y) + own;
}

/**
 * The shot that lands closest to the target with the given wind: a coarse sweep over elevations and
 * power, then a finer one around the best. Elevations are measured from the horizontal towards the
 * target, so the result works from either side.
 */
export function bestShot(heights: Heights, tanks: readonly TankPos[], shooter: number, target: number, wind: number): Aim & { miss: number } {
  const toward = tanks[target].x >= tanks[shooter].x ? 1 : -1;
  const angleOf = (elev: number) => (toward > 0 ? elev : 180 - elev);
  let best = { angle: angleOf(45), power: MAX_POWER, miss: Infinity, elev: 45 };
  const tryShot = (elev: number, power: number) => {
    if (elev < 5 || elev > 88) return;
    const p = clampPower(power);
    const angle = angleOf(elev);
    const m = miss(simulateShot(heights, tanks, shooter, angle, p, wind, { dt: PLAN_DT }), tanks, shooter, target);
    // A tie goes to the flatter shot, which is less affected by small aim errors in power.
    if (m < best.miss || (m === best.miss && elev < best.elev)) best = { angle, power: p, miss: m, elev };
  };
  // Elevations rise in the outer loop, so the first direct hit is already the flattest one the
  // sweep would find, and nothing can beat it: stop there.
  coarse: for (let elev = 15; elev <= 80; elev += 2.5) {
    for (let p = MIN_POWER; p <= MAX_POWER; p += 2) {
      tryShot(elev, p);
      if (best.miss === 0) break coarse;
    }
  }
  if (best.miss > 0) {
    const coarse = best;
    for (let de = -2.5; de <= 2.5; de += 0.5) for (let dp = -2; dp <= 2; dp += 0.25) tryShot(coarse.elev + de, coarse.power + dp);
  }
  return { angle: best.angle, power: best.power, miss: best.miss };
}

/**
 * The CPU's actual shot: it plans with only part of the wind (its `windSense`), then misses its own
 * plan by up to its aim error, shrinking with each `attempt` (shots already fired this round).
 * `next` is a [0, 1) random source.
 */
export function cpuShot(
  heights: Heights,
  tanks: readonly TankPos[],
  shooter: number,
  target: number,
  wind: number,
  profile: CpuProfile,
  attempt: number,
  next: () => number,
): Aim {
  const plan = bestShot(heights, tanks, shooter, target, wind * profile.windSense);
  const scale = Math.pow(profile.focus, Math.max(0, attempt));
  // The average of two rolls leans towards small errors while never going past the limit.
  const roll = () => next() + next() - 1;
  return {
    angle: clampAngle(plan.angle + roll() * profile.angleError * scale),
    power: clampPower(plan.power + roll() * profile.powerError * scale),
  };
}
