import { loadJSON, saveJSON, savedNumber } from './storage';

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

const dailyKey = (game: string, day: string) => `${game}:daily:${day}`;

/** The best score this device has for a game's daily challenge on the given day (today by default). */
export function getDailyBest(game: string, day: string = dailySeed()): number {
  return savedNumber(loadJSON<unknown>(dailyKey(game, day), 0));
}

/** Records a daily challenge score. Returns true if it beat this device's best for that day. */
export function submitDailyScore(game: string, score: number, day: string = dailySeed()): boolean {
  if (score <= getDailyBest(game, day)) return false;
  saveJSON(dailyKey(game, day), score);
  return true;
}
