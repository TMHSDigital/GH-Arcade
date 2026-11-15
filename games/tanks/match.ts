import { type CpuLevel, LEVEL_MULT, ROUNDS_TO_WIN } from './config';

/**
 * Who won a round once the smoke clears: the index of the tank still standing, 'draw' when both
 * are destroyed at once (the round is replayed), or null while both are alive.
 */
export function roundWinner(hp: readonly [number, number]): 0 | 1 | 'draw' | null {
  const [a, b] = hp;
  if (a <= 0 && b <= 0) return 'draw';
  if (b <= 0) return 0;
  if (a <= 0) return 1;
  return null;
}

/** The match winner from rounds won, or null while it goes on. */
export function matchWinner(rounds: readonly [number, number]): 0 | 1 | null {
  if (rounds[0] >= ROUNDS_TO_WIN) return 0;
  if (rounds[1] >= ROUNDS_TO_WIN) return 1;
  return null;
}

/** The other seat. */
export function other(i: 0 | 1): 0 | 1 {
  return i === 0 ? 1 : 0;
}

export interface MatchSummary {
  won: boolean;
  roundsWon: number;
  /** Total HP knocked off the CPU across the match. */
  damageDealt: number;
  level: CpuLevel;
}

/**
 * A vs-CPU match's score: points for the damage dealt and each round won, a bonus for taking the
 * match, all multiplied by how strong the CPU was.
 */
export function matchScore({ won, roundsWon, damageDealt, level }: MatchSummary): number {
  const base = Math.max(0, Math.round(damageDealt)) * 5 + roundsWon * 300 + (won ? 1000 : 0);
  return base * LEVEL_MULT[level];
}

export interface Streak {
  current: number;
  best: number;
}

/** A saved streak, checked: anything missing or malformed reads as no streak. */
export function readStreak(raw: unknown): Streak {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  if (typeof raw !== 'object' || raw === null) return { current: 0, best: 0 };
  const r = raw as Record<string, unknown>;
  const current = num(r.current);
  return { current, best: Math.max(current, num(r.best)) };
}

/** The streak after a finished vs-CPU match: one longer on a win, back to zero on a loss. */
export function nextStreak(s: Streak, won: boolean): Streak {
  const current = won ? s.current + 1 : 0;
  return { current, best: Math.max(s.best, current) };
}
