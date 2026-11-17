import { describe, expect, it } from 'vitest';
import type { GameEntry } from '../../games/registry';
import { cardBest, cardHref, lastPlayedSlug, sorted, type StatsFor, validSort, validTag } from './cards';

describe('cardBest', () => {
  it('shows the arcade score, or nothing before a score', () => {
    expect(cardBest(7100)).toBe(`Best ${(7100).toLocaleString()}`);
    expect(cardBest(0)).toBeNull();
  });

  it('lets a game word its own best', () => {
    expect(cardBest(7100, (s) => `Best round ${s / 100}`)).toBe('Best round 71');
    expect(cardBest(7100, () => null)).toBeNull();
  });
});

const game = (slug: string, title: string, tags: string[] = []): GameEntry => ({ slug, title, description: '', tags, accent: '#fff' });

// Registry order: Snake, Hop, Astro, Pong.
const GAMES = [game('snake', 'Neon Snake', ['classic', 'daily']), game('hop', 'Neon Hop', ['daily']), game('astro', 'Astro Blaster', ['shooter']), game('pong', 'Neon Pong')];

/** Stats for the games named; any other game has never been played. */
const stats =
  (played: Record<string, { plays: number; lastPlayed?: number }>): StatsFor =>
  (slug) =>
    played[slug] ?? { plays: 0 };

const slugs = (list: GameEntry[]) => list.map((g) => g.slug);

describe('sorted', () => {
  it('keeps registry order when featured', () => {
    expect(sorted(GAMES, 'featured', stats({ pong: { plays: 9, lastPlayed: 5 } }))).toBe(GAMES);
  });

  it('puts the most recently played first and keeps registry order for games never played', () => {
    const order = sorted(GAMES, 'recent', stats({ astro: { plays: 1, lastPlayed: 200 }, pong: { plays: 3, lastPlayed: 900 } }));
    expect(slugs(order)).toEqual(['pong', 'astro', 'snake', 'hop']);
  });

  it('orders by plays, keeping registry order between equal counts', () => {
    const order = sorted(GAMES, 'plays', stats({ hop: { plays: 4 }, astro: { plays: 4 }, pong: { plays: 7 } }));
    expect(slugs(order)).toEqual(['pong', 'hop', 'astro', 'snake']);
  });

  it('orders by title', () => {
    expect(slugs(sorted(GAMES, 'title', stats({})))).toEqual(['astro', 'hop', 'pong', 'snake']);
  });

  it('leaves the list it was given alone', () => {
    const before = slugs(GAMES);
    sorted(GAMES, 'title', stats({}));
    expect(slugs(GAMES)).toEqual(before);
  });
});

describe('lastPlayedSlug', () => {
  it('is null when nothing has been played', () => {
    expect(lastPlayedSlug(GAMES, stats({}))).toBeNull();
    // Plays without a time (from before it was recorded) do not count.
    expect(lastPlayedSlug(GAMES, stats({ hop: { plays: 3 } }))).toBeNull();
  });

  it('names the game with the latest run', () => {
    expect(lastPlayedSlug(GAMES, stats({ snake: { plays: 1, lastPlayed: 50 }, astro: { plays: 1, lastPlayed: 80 }, pong: { plays: 1, lastPlayed: 20 } }))).toBe('astro');
  });
});

describe('cardHref', () => {
  it('opens the game on DAILY while the challenge of the day is waiting', () => {
    expect(cardHref('hop', true)).toBe('games/hop/?mode=daily');
  });

  it('opens the game plainly once the daily is played, or when it has none', () => {
    expect(cardHref('hop', false)).toBe('games/hop/');
  });

  it('escapes a slug that is not safe in a path', () => {
    expect(cardHref('odd slug', false)).toBe('games/odd%20slug/');
  });
});

describe('remembered choices', () => {
  it('keeps a tag some game still has', () => {
    expect(validTag('daily', GAMES)).toBe('daily');
  });

  it('falls back to All for a tag no game has, or anything that is not a tag', () => {
    expect(validTag('retired', GAMES)).toBeNull();
    expect(validTag(null, GAMES)).toBeNull();
    expect(validTag(7, GAMES)).toBeNull();
    expect(validTag(['daily'], GAMES)).toBeNull();
  });

  it('keeps a known sort and falls back to featured for anything else', () => {
    expect(validSort('plays')).toBe('plays');
    expect(validSort('bogus')).toBe('featured');
    expect(validSort(null)).toBe('featured');
    expect(validSort(2)).toBe('featured');
  });
});
