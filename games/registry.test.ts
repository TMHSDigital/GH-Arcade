import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import registry from './registry.json';
import { TROPHIES } from '../shared/achievements';

/**
 * The list of games has two sources: Vite builds a page for every games/<slug>/index.html and the
 * hub (and the "play every game" trophy) lists registry.json. Trophies are declared per game in
 * games/<slug>/trophies.ts. These checks keep them in step.
 */

const gamesDir = import.meta.dirname;
const publicDir = resolve(gamesDir, '..', 'public');
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface Entry {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  accent: string;
  controls?: string;
  thumbnail?: string;
}
const games = registry as Entry[];
const slugs = games.map((g) => g.slug);

/** Folders Vite turns into pages: not starting with "_" and containing index.html (see vite.config.ts). */
const folders = readdirSync(gamesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(resolve(gamesDir, d.name, 'index.html')))
  .map((d) => d.name);

describe('registry.json', () => {
  it('has unique, well-formed slugs', () => {
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(SLUG);
  });

  it('lists exactly the game folders that are built', () => {
    expect([...slugs].sort()).toEqual([...folders].sort());
  });

  it.each(games)('$slug has complete card details', (game) => {
    expect(game.title.trim()).not.toBe('');
    expect(game.description.trim()).not.toBe('');
    expect((game.controls ?? '').trim()).not.toBe('');
    expect(game.tags.length).toBeGreaterThan(0);
    for (const tag of game.tags) expect(tag.trim()).not.toBe('');
    expect(game.accent).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('points every thumbnail at a file under public/', () => {
    for (const game of games) {
      if (game.thumbnail) expect(existsSync(resolve(publicDir, game.thumbnail)), game.thumbnail).toBe(true);
    }
  });
});

describe('trophies', () => {
  it('have unique ids', () => {
    const ids = TROPHIES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('belong to a registered game or to the arcade', () => {
    for (const t of TROPHIES) {
      if (t.game !== 'arcade') expect(slugs, t.id).toContain(t.game);
    }
  });

  it('use their game\'s slug as the id prefix', () => {
    for (const t of TROPHIES) expect(t.id.startsWith(`${t.game}.`), t.id).toBe(true);
  });

  it('are collected from every game that declares some', () => {
    const declaring = folders.filter((slug) => existsSync(resolve(gamesDir, slug, 'trophies.ts')));
    for (const slug of declaring) expect(TROPHIES.some((t) => t.game === slug), slug).toBe(true);
    expect(TROPHIES.some((t) => t.game.startsWith('_'))).toBe(false);
  });

  it('set counter and target together or not at all', () => {
    for (const t of TROPHIES) expect(t.counter === undefined, t.id).toBe(t.target === undefined);
  });
});

describe('daily challenge tag', () => {
  it('is on exactly the games whose menu offers a daily mode', () => {
    const tagged = games.filter((g) => g.tags.includes('daily')).map((g) => g.slug).sort();
    const offering = games
      .filter((g) => readFileSync(resolve(gamesDir, g.slug, 'scenes', 'MenuScene.ts'), 'utf8').includes('DAILY_MODES'))
      .map((g) => g.slug)
      .sort();
    expect(tagged).toEqual(offering);
  });
});
