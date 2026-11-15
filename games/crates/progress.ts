import { GAME_ID } from './config';
import { LEVELS } from './levels';
import { levelScore } from './rules';
import { isRecord, loadJSON, savedNumber, saveJSON } from '../../shared/storage';

/**
 * Saved progress: the best (fewest) moves for each solved level, keyed by level name so that adding
 * or reordering levels keeps every record with its level. No Phaser here.
 */
export type Progress = Record<string, number>;

const KEY = `${GAME_ID}:best`;

/** Checks the shape of saved progress: whole move counts above zero for known levels only. */
export function cleanProgress(raw: unknown): Progress {
  const out: Progress = {};
  if (!isRecord(raw)) return out;
  for (const { name } of LEVELS) {
    const moves = Math.floor(savedNumber(raw[name]));
    if (moves > 0) out[name] = moves;
  }
  return out;
}

export function loadProgress(): Progress {
  return cleanProgress(loadJSON<unknown>(KEY, {}));
}

/**
 * Records a solve. Returns the updated progress and whether this solve set a new best (a first
 * solve counts). Never changes `progress` itself.
 */
export function recordSolve(progress: Progress, name: string, moves: number): { progress: Progress; improved: boolean } {
  const best = progress[name];
  if (best !== undefined && best <= moves) return { progress, improved: false };
  return { progress: { ...progress, [name]: moves }, improved: true };
}

export function saveProgress(progress: Progress): void {
  saveJSON(KEY, progress);
}

export function solvedCount(progress: Progress): number {
  return LEVELS.filter((l) => progress[l.name] !== undefined).length;
}

/** Levels solved in par moves. */
export function parCount(progress: Progress): number {
  return LEVELS.filter((l) => progress[l.name] !== undefined && progress[l.name] <= l.par).length;
}

/** The score across every level: up to 1000 a level, see levelScore. */
export function totalScore(progress: Progress): number {
  return LEVELS.reduce((sum, l) => sum + levelScore(progress[l.name], l.par), 0);
}

/** The first level not solved yet, or 0 once all are. */
export function firstUnsolved(progress: Progress): number {
  const i = LEVELS.findIndex((l) => progress[l.name] === undefined);
  return i === -1 ? 0 : i;
}
