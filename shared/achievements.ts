import { loadJSON, saveJSON } from './storage';

/**
 * Trophies and per-game stats, saved on this device. No Phaser here, so the hub can list them.
 *
 * Games call `unlock('snake.bonus')` when something happens, or `addCounter('stack.lines', 4)` for
 * running totals (trophies tied to a counter unlock automatically at their target).
 * Plays and best scores are recorded by the shared game-over screen via `recordPlay()`.
 */

export interface Trophy {
  id: string;
  /** Game slug, or 'arcade' for arcade-wide trophies. */
  game: string;
  title: string;
  description: string;
  /** Unlocks automatically when this counter reaches `target`. */
  counter?: string;
  target?: number;
}

export const TROPHIES: Trophy[] = [
  { id: 'breakout.clear', game: 'breakout', title: 'Brick by Brick', description: 'Clear the first level' },
  { id: 'breakout.combo', game: 'breakout', title: 'Chain Reaction', description: 'Reach an x8 combo' },
  { id: 'breakout.multi', game: 'breakout', title: 'Crowd Control', description: 'Have 5 balls in play at once' },
  { id: 'breakout.score', game: 'breakout', title: 'High Roller', description: 'Score 10,000 points' },

  { id: 'snake.bonus', game: 'snake', title: 'Star Catcher', description: 'Eat a bonus star' },
  { id: 'snake.len25', game: 'snake', title: 'Growth Spurt', description: 'Reach length 25' },
  { id: 'snake.len50', game: 'snake', title: 'Neon Serpent', description: 'Reach length 50' },
  { id: 'snake.score', game: 'snake', title: 'Snake Charmer', description: 'Score 1,000 points' },

  { id: 'stack.quad', game: 'stack', title: 'Quad Squad', description: 'Clear 4 lines at once' },
  { id: 'stack.b2b', game: 'stack', title: 'Back to Back', description: 'Clear two quads in a row' },
  { id: 'stack.level5', game: 'stack', title: 'Speed Stacker', description: 'Reach level 5' },
  { id: 'stack.lines', game: 'stack', title: 'Line Worker', description: 'Clear 100 lines in total', counter: 'stack.lines', target: 100 },

  { id: 'astro.saucer', game: 'astro', title: 'Saucer Down', description: 'Shoot down a saucer' },
  { id: 'astro.wave5', game: 'astro', title: 'Wave Rider', description: 'Reach wave 5' },
  { id: 'astro.score', game: 'astro', title: 'Rock Crusher', description: 'Score 10,000 points' },
  { id: 'astro.rocks', game: 'astro', title: 'Demolition Crew', description: 'Destroy 500 rocks in total', counter: 'astro.rocks', target: 500 },

  { id: 'runner.1k', game: 'runner', title: 'First Kilometre', description: 'Run 1,000m in one run' },
  { id: 'runner.3k', game: 'runner', title: 'Marathoner', description: 'Run 3,000m in one run' },
  { id: 'runner.coins', game: 'runner', title: 'Pocket Change', description: 'Collect 20 coins in one run' },
  { id: 'runner.bank', game: 'runner', title: 'Treasure Hunter', description: 'Collect 500 coins in total', counter: 'runner.coins', target: 500 },

  { id: 'siege.wave3', game: 'siege', title: 'Holding the Line', description: 'Clear wave 3' },
  { id: 'siege.mothership', game: 'siege', title: 'Mothership Down', description: 'Shoot the mothership' },
  { id: 'siege.score', game: 'siege', title: 'Star Defender', description: 'Score 5,000 points' },
  { id: 'siege.coop', game: 'siege', title: 'Better Together', description: 'Clear a wave in two-player co-op' },

  { id: 'hop.home', game: 'hop', title: 'Safe Harbor', description: 'Reach a dock' },
  { id: 'hop.full', game: 'hop', title: 'Full House', description: 'Fill all five docks' },
  { id: 'hop.level3', game: 'hop', title: 'Rush Hour', description: 'Reach level 3' },
  { id: 'hop.score', game: 'hop', title: 'Road Warrior', description: 'Score 5,000 points' },

  { id: 'pong.win', game: 'pong', title: 'Table Champion', description: 'Beat the CPU' },
  { id: 'pong.shutout', game: 'pong', title: 'Clean Sheet', description: 'Beat the CPU 7-0' },
  { id: 'pong.rally', game: 'pong', title: 'Long Rally', description: 'Keep a rally going for 20 hits' },
  { id: 'pong.versus', game: 'pong', title: 'Friendly Match', description: 'Finish a two-player match' },

  { id: 'arcade.all', game: 'arcade', title: 'Arcade Regular', description: 'Play every game in the arcade' },
  { id: 'arcade.plays', game: 'arcade', title: 'Insert Another Coin', description: 'Play 25 games', counter: 'arcade.plays', target: 25 },
  { id: 'arcade.case', game: 'arcade', title: 'Trophy Case', description: 'Unlock 10 other trophies' },
];

export interface GameStats {
  plays: number;
  best: number;
  totalScore: number;
}

interface Save {
  unlocked: Record<string, number>;
  counters: Record<string, number>;
  games: Record<string, GameStats>;
}

const KEY = 'trophies';
let save: Save = { unlocked: {}, counters: {}, games: {}, ...loadJSON<Partial<Save>>(KEY, {}) };
const listeners = new Set<(t: Trophy) => void>();
/** Trophies unlocked since the last drainRecentUnlocks(), e.g. to list on the game-over screen. */
let recent: Trophy[] = [];

function persist(): void {
  saveJSON(KEY, save);
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
  if (id !== 'arcade.case' && Object.keys(save.unlocked).filter((k) => k !== 'arcade.case').length >= 10) unlock('arcade.case');
  return true;
}

/** Adds to a running total and unlocks any trophy whose target it reaches. Returns the new total. */
export function addCounter(counter: string, amount = 1): number {
  const total = (save.counters[counter] ?? 0) + amount;
  save.counters[counter] = total;
  persist();
  for (const t of TROPHIES) if (t.counter === counter && t.target !== undefined && total >= t.target) unlock(t.id);
  return total;
}

export function getCounter(counter: string): number {
  return save.counters[counter] ?? 0;
}

/** Called once per finished game with its final score. */
export function recordPlay(game: string, score: number): void {
  const stats = save.games[game] ?? { plays: 0, best: 0, totalScore: 0 };
  stats.plays++;
  stats.best = Math.max(stats.best, score);
  stats.totalScore += score;
  save.games[game] = stats;
  persist();
  addCounter('arcade.plays');
  const played = new Set(Object.keys(save.games));
  if (TROPHIES.filter((t) => t.game !== 'arcade').every((t) => played.has(t.game))) unlock('arcade.all');
}

export function getStats(game: string): GameStats {
  return save.games[game] ?? { plays: 0, best: 0, totalScore: 0 };
}

/** Returns the trophies unlocked since the last call, and clears the list. */
export function drainRecentUnlocks(): Trophy[] {
  const out = recent;
  recent = [];
  return out;
}

/** Calls `fn` for every newly unlocked trophy. Returns an unsubscribe function. */
export function onUnlock(fn: (t: Trophy) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetTrophies(): void {
  save = { unlocked: {}, counters: {}, games: {} };
  persist();
}
