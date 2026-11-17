import type { GameEntry } from '../../games/registry';
import { modeQuery } from '../../shared/modes';
import { DAILY_MODE_LABEL } from '../../shared/rng';

/**
 * The decisions behind the hub's game cards: their order, which one was played last, where a card
 * links to and which saved choices are still valid. No DOM and no storage here: the stats and saved
 * values are passed in, so each rule can be tested on its own.
 */

export const SORTS = ['featured', 'recent', 'plays', 'title'] as const;
export type Sort = (typeof SORTS)[number];

/** What the ordering needs to know about a game's history. */
export type StatsFor = (slug: string) => { plays: number; lastPlayed?: number };

/** A game's own wording for its best, from bestLabel in its trophies.ts: null when there is nothing to show. */
export type BestLabel = (highScore: number) => string | null;

/** The best shown on a card: the game's own wording when it has one, else the arcade score. */
export function cardBest(highScore: number, label?: BestLabel): string | null {
  if (label) return label(highScore);
  return highScore > 0 ? `Best ${highScore.toLocaleString()}` : null;
}

/** Orders the cards. Ties (and games never played) keep their registry order, so the grid stays stable. */
export function sorted(list: GameEntry[], sort: Sort, statsFor: StatsFor): GameEntry[] {
  if (sort === 'featured') return list;
  const key: Record<Exclude<Sort, 'featured'>, (a: GameEntry, b: GameEntry) => number> = {
    recent: (a, b) => (statsFor(b.slug).lastPlayed ?? 0) - (statsFor(a.slug).lastPlayed ?? 0),
    plays: (a, b) => statsFor(b.slug).plays - statsFor(a.slug).plays,
    title: (a, b) => a.title.localeCompare(b.title),
  };
  return [...list].sort(key[sort]);
}

/** The game with the most recent finished run, if any, so its card can say so. */
export function lastPlayedSlug(games: GameEntry[], statsFor: StatsFor): string | null {
  let best: GameEntry | null = null;
  let bestAt = 0;
  for (const g of games) {
    const at = statsFor(g.slug).lastPlayed ?? 0;
    if (at > bestAt) {
      best = g;
      bestAt = at;
    }
  }
  return best?.slug ?? null;
}

/**
 * Where a card links to. The link is relative, so it works under any base path (dev server and
 * GitHub Pages). While today's daily challenge is waiting, the card opens the game's menu on DAILY.
 */
export function cardHref(slug: string, dailyWaiting: boolean): string {
  return `games/${encodeURIComponent(slug)}/${dailyWaiting ? modeQuery(DAILY_MODE_LABEL) : ''}`;
}

/** The remembered tag filter, or null ("All") for a tag no game has any more or anything unexpected. */
export function validTag(saved: unknown, games: GameEntry[]): string | null {
  return typeof saved === 'string' && games.some((g) => g.tags.includes(saved)) ? saved : null;
}

/** The remembered order, or registry order for anything unexpected. */
export function validSort(saved: unknown): Sort {
  return SORTS.find((s) => s === saved) ?? 'featured';
}
