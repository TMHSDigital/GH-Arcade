import { HOLE_POINTS, MAX_STROKES, WATER_PENALTY } from './config';

/**
 * Strokes, par and the round's score. No Phaser here.
 *
 * The arcade keeps a best score where higher is better, so a round's score counts the strokes saved
 * under the cap on every hole: score = (cap + 1 - strokes) x 100, summed. Fewer strokes always means
 * a higher score, and the best round's total can be read back from the best score.
 */

/** Strokes after a penalty for water, never past the cap. */
export function withPenalty(strokes: number): number {
  return Math.min(MAX_STROKES, strokes + WATER_PENALTY);
}

/** True once a hole has used all its strokes and the ball is picked up. */
export function atCap(strokes: number): boolean {
  return strokes >= MAX_STROKES;
}

/** The name for a hole's result: HOLE IN ONE, EAGLE, BIRDIE, PAR, BOGEY... */
export function resultName(strokes: number, par: number): string {
  if (strokes === 1) return 'HOLE IN ONE';
  const diff = strokes - par;
  if (diff <= -3) return 'ALBATROSS';
  if (diff === -2) return 'EAGLE';
  if (diff === -1) return 'BIRDIE';
  if (diff === 0) return 'PAR';
  if (diff === 1) return 'BOGEY';
  if (diff === 2) return 'DOUBLE BOGEY';
  return `+${diff}`;
}

/** Strokes against par as golfers write it: E for even, +3, -2. */
export function toPar(diff: number): string {
  return diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
}

/** The score of a round (or the holes played so far). */
export function roundScore(strokes: readonly number[]): number {
  return strokes.reduce((sum, s) => sum + (MAX_STROKES + 1 - Math.min(MAX_STROKES, Math.max(1, s))) * HOLE_POINTS, 0);
}

/** The stroke total of a full round of `holes` holes that scored `score`, or 0 for no score yet. */
export function totalFromScore(score: number, holes: number): number {
  if (score <= 0) return 0;
  return holes * (MAX_STROKES + 1) - Math.round(score / HOLE_POINTS);
}

export interface RoundSummary {
  total: number;
  par: number;
  /** Total minus par: negative is under par. */
  diff: number;
  /** Holes at one under par or better, holes in one included. */
  birdies: number;
  aces: number;
  /** True when every hole played was at par or better. */
  clean: boolean;
}

/** Totals for the holes played so far: `strokes[i]` was played on a hole of par `pars[i]`. */
export function summarize(strokes: readonly number[], pars: readonly number[]): RoundSummary {
  let total = 0;
  let par = 0;
  let birdies = 0;
  let aces = 0;
  let clean = true;
  strokes.forEach((s, i) => {
    total += s;
    par += pars[i];
    if (s < pars[i]) birdies++;
    if (s === 1) aces++;
    if (s > pars[i]) clean = false;
  });
  return { total, par, diff: total - par, birdies, aces, clean };
}

/**
 * The scorecard as three lines of fixed-width columns (hole numbers, par, strokes) with totals at
 * the end. Holes not yet played show a dash.
 */
export function scorecardLines(strokes: readonly number[], pars: readonly number[]): [string, string, string] {
  const col = (v: string | number) => String(v).padStart(3);
  const played = summarize(strokes, pars);
  const parTotal = pars.reduce((a, b) => a + b, 0);
  return [
    `HOLE${pars.map((_, i) => col(i + 1)).join('')}  TOT`,
    `PAR ${pars.map(col).join('')}${String(parTotal).padStart(5)}`,
    `YOU ${pars.map((_, i) => col(strokes[i] ?? '-')).join('')}${String(strokes.length ? played.total : '-').padStart(5)}`,
  ];
}
