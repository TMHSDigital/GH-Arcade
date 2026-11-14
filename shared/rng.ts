import { isRecord, loadJSON, saveJSON, savedNumber, STORAGE_PREFIX } from './storage';

/**
 * Seeded random numbers, for anything that should be repeatable: a daily challenge where every
 * player gets the same sequence, or a test. Games that just want variety can keep Math.random.
 * No Phaser here.
 */

export interface Rng {
  /** A float in [0, 1), like Math.random. Detached-safe: pass \`rng.next\` wherever a () => number is expected. */
  next: () => number;
  /** A whole number from min to max, both included. */
  between: (min: number, max: number) => number;
  /** One item from a non-empty list. */
  pick: <T>(list: readonly T[]) => T;
  /** A shuffled copy of the list; the original is left alone. */
  shuffle: <T>(list: readonly T[]) => T[];
}

/** Turns any text into a 32-bit number (FNV-1a), so seeds can be words or dates. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small, fast generator (mulberry32). The same seed always produces the same sequence. */
export function createRng(seed: number | string): Rng {
  let state = typeof seed === 'number' ? seed >>> 0 : hash(seed);
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    between,
    pick: (list) => list[between(0, list.length - 1)],
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = between(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/** Today's date in UTC as yyyy-mm-dd: the seed every player shares for a daily challenge. */
export function dailySeed(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** How many days of daily results are kept per game; older ones are dropped. */
export const DAILY_KEEP = 60;
/** A game's daily bests live in one saved record, keyed by day. */
const dailyKey = (game: string) => `${game}:daily`;

/**
 * Daily bests were first saved one key per day ("<slug>:daily:<date>"), which grew without limit.
 * Folds any such keys for a game into `history` (keeping the higher score) and removes them.
 * Returns true if anything was folded. Old backups restore those keys, so this runs on every read.
 */
function foldLegacyDays(game: string, history: Record<string, number>): boolean {
  const prefix = `${STORAGE_PREFIX}${game}:daily:`;
  let changed = false;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix) && DAY.test(key.slice(prefix.length))) keys.push(key);
    }
    for (const key of keys) {
      const day = key.slice(prefix.length);
      const score = savedNumber(loadJSON<unknown>(key.slice(STORAGE_PREFIX.length), 0));
      if (score > (history[day] ?? 0)) history[day] = score;
      localStorage.removeItem(key);
      changed = true;
    }
  } catch {
    /* storage unavailable; nothing to fold */
  }
  return changed;
}

/** Only the newest DAILY_KEEP days. */
function newest(history: Record<string, number>): Record<string, number> {
  const days = Object.keys(history).sort().slice(-DAILY_KEEP);
  return Object.fromEntries(days.map((day) => [day, history[day]]));
}

/** This device's best score for each day a game's daily challenge was played, keyed by yyyy-mm-dd. */
export function getDailyHistory(game: string): Record<string, number> {
  const raw = loadJSON<unknown>(dailyKey(game), {});
  let history: Record<string, number> = {};
  if (isRecord(raw)) for (const [day, score] of Object.entries(raw)) if (DAY.test(day) && savedNumber(score) > 0) history[day] = savedNumber(score);
  if (foldLegacyDays(game, history)) {
    history = newest(history);
    saveJSON(dailyKey(game), history);
  }
  return history;
}

/** The best score this device has for a game's daily challenge on the given day (today by default). */
export function getDailyBest(game: string, day: string = dailySeed()): number {
  return getDailyHistory(game)[day] ?? 0;
}

/** Records a daily challenge score. Returns true if it beat this device's best for that day. */
export function submitDailyScore(game: string, score: number, day: string = dailySeed()): boolean {
  const history = getDailyHistory(game);
  if (score <= (history[day] ?? 0)) return false;
  history[day] = score;
  saveJSON(dailyKey(game), newest(history));
  return true;
}

/** The day before a yyyy-mm-dd day. */
function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/**
 * How many days in a row a game's daily challenge has been played, counting back from today. A
 * streak that reached yesterday still stands until today is over.
 */
export function dailyStreak(game: string, today: string = dailySeed()): number {
  const history = getDailyHistory(game);
  let day = history[today] ? today : previousDay(today);
  let streak = 0;
  while (history[day]) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}

/** The tag in games/registry.json that marks a game with a daily challenge; the hub shows today's result for those. */
export const DAILY_TAG = 'daily';

/** The menu label of the daily mode. Links name it too: games/<slug>/?mode=daily (shared/modes.ts). */
export const DAILY_MODE_LABEL = 'DAILY';

/**
 * Menu choices for a game with a daily challenge, for `modes` in buildMenu(): the game scene gets
 * `{ daily: true }` when the player picks DAILY.
 */
export const DAILY_MODES = [
  { label: 'PLAY', data: {} },
  { label: DAILY_MODE_LABEL, data: { daily: true } },
];

/**
 * Seeded random numbers for one part of today's challenge, e.g. dailyRng('hop', day, 'lanes:2').
 * Giving each part its own sequence keeps them the same for every player even when one part is
 * used at a moment that depends on how the player is doing.
 */
export function dailyRng(game: string, day: string, part = ''): Rng {
  return createRng(part ? `${game}:${day}:${part}` : `${game}:${day}`);
}

/** Records a finished daily run and returns the line for the game-over screen. */
export function dailyResult(game: string, score: number, day: string): string {
  const record = submitDailyScore(game, score, day);
  return `DAILY ${day}   ${record ? 'NEW BEST TODAY' : `TODAY'S BEST ${getDailyBest(game, day).toLocaleString()}`}`;
}
