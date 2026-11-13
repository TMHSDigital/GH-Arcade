import registry from '../games/registry.json';
import { isRecord, loadJSON, onExternalChange, saveJSON, savedNumber, STORAGE_PREFIX } from './storage';
import type { Trophy, TrophyDef } from './trophy-types';

/**
 * Trophies and per-game stats, saved on this device. No Phaser here, so the hub can list them.
 *
 * Each game lists its trophies in games/<slug>/trophies.ts and gets typed helpers for them from
 * `trophiesFor<typeof TROPHIES>()`: `unlock('snake.bonus')` when something happens,
 * `reach('snake.score', score)` for trophies earned at a `threshold` within one run, or
 * `addCounter('stack.lines', 4)` for running totals (trophies tied to a counter unlock automatically
 * at their target). A mistyped id or counter fails the typecheck.
 * Plays and best scores are recorded when a run ends, via `finishRun()` in shared/scenes.ts.
 * A game's best score lives here, in its stats, and nowhere else.
 */

export type { Trophy, TrophyDef };

/** Arcade-wide trophies, which belong to no single game. */
const ARCADE_TROPHIES = [
  { id: 'arcade.all', title: 'Arcade Regular', description: 'Play every game in the arcade' },
  { id: 'arcade.plays', title: 'Insert Another Coin', description: 'Play 25 games', counter: 'arcade.plays', target: 25 },
  { id: 'arcade.case', title: 'Trophy Case', description: 'Unlock 10 other trophies' },
] as const satisfies readonly TrophyDef[];
type ArcadeTrophyId = (typeof ARCADE_TROPHIES)[number]['id'];
/** The counter names used by a list of trophies (never, if none of them has a counter). */
type CounterOf<T extends readonly TrophyDef[]> = Extract<T[number], { counter: string }>['counter'];
/** The ids of the trophies in a list that declare a `threshold`. */
type ThresholdIdOf<T extends readonly TrophyDef[]> = Extract<T[number], { threshold: number }>['id'];

// Every game declares its own trophies in games/<slug>/trophies.ts. They are plain data (no Phaser),
// so collecting them here keeps the hub light.
const perGame = import.meta.glob<{ TROPHIES: readonly TrophyDef[] }>('../games/*/trophies.ts', { eager: true });

export const TROPHIES: Trophy[] = [
  ...Object.entries(perGame)
    .filter(([path]) => !path.includes('/_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([path, mod]) => {
      const game = path.split('/').at(-2)!;
      return mod.TROPHIES.map((t) => ({ ...t, game }));
    }),
  ...ARCADE_TROPHIES.map((t) => ({ ...t, game: 'arcade' })),
];

/** Every game on the hub; the "play every game" trophy needs a play in each. */
const GAME_SLUGS = (registry as { slug: string }[]).map((g) => g.slug);

export interface GameStats {
  plays: number;
  best: number;
  totalScore: number;
  /** When the last run finished (ms since epoch); missing for games not played since this was added. */
  lastPlayed?: number;
}

interface Save {
  unlocked: Record<string, number>;
  counters: Record<string, number>;
  games: Record<string, GameStats>;
}

const KEY = 'trophies';
/** Bumped when the saved shape changes, so a later version can tell old saves apart. */
const SAVE_VERSION = 1;

function numberMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isRecord(raw)) for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

/**
 * Best scores used to be stored a second time under "<slug>:highscore". Folds any such keys into
 * the stats (keeping the higher value) and removes them. Returns true if anything was migrated.
 */
function adoptLegacyBests(games: Record<string, GameStats>): boolean {
  const legacy = /^(.+):highscore$/;
  let changed = false;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX) && legacy.test(key.slice(STORAGE_PREFIX.length))) keys.push(key);
    }
    for (const key of keys) {
      const slug = key.slice(STORAGE_PREFIX.length).match(legacy)![1];
      const best = savedNumber(loadJSON<unknown>(key.slice(STORAGE_PREFIX.length), 0));
      const stats = games[slug] ?? { plays: 0, best: 0, totalScore: 0 };
      games[slug] = { ...stats, best: Math.max(stats.best, best) };
      localStorage.removeItem(key);
      changed = true;
    }
  } catch {
    /* storage unavailable; nothing to migrate */
  }
  return changed;
}

/** Reads the save, keeping only well-formed parts, so stale or hand-edited data can never throw later. */
function read(): Save {
  const raw = loadJSON<unknown>(KEY, {});
  const data = isRecord(raw) ? raw : {};
  const games: Record<string, GameStats> = {};
  if (isRecord(data.games)) {
    for (const [slug, stats] of Object.entries(data.games)) {
      if (isRecord(stats)) {
        games[slug] = { plays: savedNumber(stats.plays), best: savedNumber(stats.best), totalScore: savedNumber(stats.totalScore) };
        if (savedNumber(stats.lastPlayed)) games[slug].lastPlayed = savedNumber(stats.lastPlayed);
      }
    }
  }
  const result = { unlocked: numberMap(data.unlocked), counters: numberMap(data.counters), games };
  if (adoptLegacyBests(games)) saveJSON(KEY, { version: SAVE_VERSION, ...result });
  return result;
}

let save: Save = read();
/** True while counters have changed in memory but not been written yet (see addCounter). */
let dirty = false;
// Another tab unlocked something, recorded a play or reset trophies: pick that up before the next save.
onExternalChange(KEY, () => {
  const unsaved = dirty ? save.counters : {};
  save = read();
  // Counter progress from the run in this tab has not been written yet; do not lose it.
  for (const [name, total] of Object.entries(unsaved)) save.counters[name] = Math.max(save.counters[name] ?? 0, total);
});
// Counters are written when a run ends or a trophy unlocks. If the player closes or leaves the tab
// mid-run, this is the last chance to save them.
if (typeof document !== 'undefined') {
  const flush = () => {
    if (dirty) persist();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
const listeners = new Set<(t: Trophy) => void>();
/** Trophies unlocked since the last drainRecentUnlocks(), e.g. to list on the game-over screen. */
let recent: Trophy[] = [];

function persist(): void {
  dirty = false;
  saveJSON(KEY, { version: SAVE_VERSION, ...save });
}

export function isUnlocked(id: string): boolean {
  return id in save.unlocked;
}

export function unlockedAt(id: string): number | undefined {
  return save.unlocked[id];
}

/** Unlocks a trophy. Returns true if it was newly unlocked (and notifies listeners, e.g. for a toast). */
export function unlock(id: string): boolean {
  const trophy = TROPHIES.find((t) => t.id === id);
  if (!trophy || isUnlocked(id)) return false;
  save.unlocked[id] = Date.now();
  persist();
  recent.push(trophy);
  listeners.forEach((fn) => fn(trophy));
  // Meta trophy: ten others unlocked.
  const collection: ArcadeTrophyId = 'arcade.case';
  if (id !== collection && Object.keys(save.unlocked).filter((k) => k !== collection).length >= 10) unlock(collection);
  return true;
}

/**
 * Typed `unlock` and `addCounter` for one game: they only accept the ids and counters in that
 * game's trophies.ts, so a typo is a compile error instead of a trophy that silently never unlocks.
 *
 *   const { unlock, addCounter } = trophiesFor<typeof TROPHIES>();
 */
export function trophiesFor<T extends readonly TrophyDef[]>(): {
  unlock: (id: T[number]['id']) => boolean;
  reach: (id: ThresholdIdOf<T>, value: number) => boolean;
  addCounter: (counter: CounterOf<T>, amount?: number) => number;
} {
  return { unlock, reach, addCounter };
}

/**
 * Unlocks a trophy once `value` (this run's score, level, length...) has reached the `threshold`
 * declared beside it in trophies.ts. Returns true if it was newly unlocked.
 */
export function reach(id: string, value: number): boolean {
  const threshold = TROPHIES.find((t) => t.id === id)?.threshold;
  return threshold !== undefined && value >= threshold && unlock(id);
}

/**
 * Adds to a running total and unlocks any trophy whose target it reaches. Returns the new total.
 * Games call this in the middle of play (every coin, every rock), so it only updates memory: the
 * total is written with the next unlock, when the run is recorded, or when the page is hidden.
 */
export function addCounter(counter: string, amount = 1): number {
  const total = (save.counters[counter] ?? 0) + amount;
  save.counters[counter] = total;
  dirty = true;
  for (const t of TROPHIES) if (t.counter === counter && t.target !== undefined && total >= t.target) unlock(t.id);
  return total;
}

export function getCounter(counter: string): number {
  return save.counters[counter] ?? 0;
}

/**
 * Called once per finished game with its final score (0 for matches that have no score, e.g. versus).
 * Returns true when the score beat the game's previous best.
 */
export function recordPlay(game: string, score = 0): boolean {
  const stats = save.games[game] ?? { plays: 0, best: 0, totalScore: 0 };
  const isRecord = score > stats.best;
  stats.plays++;
  stats.best = Math.max(stats.best, score);
  stats.totalScore += score;
  stats.lastPlayed = Date.now();
  save.games[game] = stats;
  persist();
  const plays: CounterOf<typeof ARCADE_TROPHIES> = 'arcade.plays';
  addCounter(plays);
  // A game can have stats without a play (a best score kept through a reset), so count plays, not entries.
  const everyGame: ArcadeTrophyId = 'arcade.all';
  if (GAME_SLUGS.every((slug) => (save.games[slug]?.plays ?? 0) > 0)) unlock(everyGame);
  return isRecord;
}

/** The best score recorded for a game, or 0. */
export function getHighScore(game: string): number {
  return getStats(game).best;
}

export function getStats(game: string): GameStats {
  return save.games[game] ?? { plays: 0, best: 0, totalScore: 0 };
}

/** How many of a game's trophies are unlocked, e.g. for a "2/4" chip on its hub card. */
export function trophyProgress(game: string): { unlocked: number; total: number } {
  const own = TROPHIES.filter((t) => t.game === game);
  return { unlocked: own.filter((t) => isUnlocked(t.id)).length, total: own.length };
}

/** Returns the trophies unlocked since the last call, and clears the list. */
export function drainRecentUnlocks(): Trophy[] {
  const out = recent;
  recent = [];
  return out;
}

/** Forgets trophies from a run that never reached an end screen, so they are not credited to the next one. */
export function clearRecentUnlocks(): void {
  recent = [];
}

/** Calls `fn` for every newly unlocked trophy. Returns an unsubscribe function. */
export function onUnlock(fn: (t: Trophy) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Clears trophies, counters, plays and totals. Best scores are kept. */
export function resetTrophies(): void {
  const games: Record<string, GameStats> = {};
  for (const [slug, stats] of Object.entries(save.games)) if (stats.best > 0) games[slug] = { plays: 0, best: stats.best, totalScore: 0 };
  save = { unlocked: {}, counters: {}, games };
  recent = [];
  persist();
}

/** Clears every game's best score. Trophies, plays and totals are kept. */
export function resetBestScores(): void {
  for (const stats of Object.values(save.games)) stats.best = 0;
  persist();
}
